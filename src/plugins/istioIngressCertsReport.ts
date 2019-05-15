import _ from 'lodash'
import {ActionGroupSpec, ActionContextType, ActionOutputStyle, ActionOutput, ActionContextOrder} from '../actions/actionSpec'
import K8sFunctions from '../k8s/k8sFunctions'
import IstioPluginHelper from '../k8s/istioPluginHelper'
import IstioFunctions from '../k8s/istioFunctions';

const plugin : ActionGroupSpec = {
  context: ActionContextType.Istio,
  title: "Istio Ingress Recipes",
  actions: [
    {
      name: "Ingress Certs Report",
      order: 15,
      
      async act(actionContext) {
        const clusters = actionContext.getClusters()
        this.onOutput &&
          this.onOutput([["", "Ingress Gateway Certs Usage"]], ActionOutputStyle.Table)

        this.showOutputLoading && this.showOutputLoading(true)
        for(const cluster of clusters) {
          this.onStreamOutput  && this.onStreamOutput([[">Cluster: " + cluster.name, ""]])
          if(!cluster.hasIstio) {
            this.onStreamOutput  && this.onStreamOutput([["", "Istio not installed"]])
            continue
          }
          const k8sClient = cluster.k8sClient
          const ingressDeployment = await K8sFunctions.getDeploymentDetails(cluster.name, 
                                      "istio-system", "istio-ingressgateway", k8sClient)
          if(!ingressDeployment) {
            this.onStreamOutput && this.onStreamOutput(["", "istio-ingressgateway not found"])
            continue
          } 
          const podTemplate = ingressDeployment.template
          const istioProxyContainer = podTemplate.containers.filter(c => c.name === "istio-proxy" 
                                      || c.name === 'ingressgateway')[0]
          const istioSDSContainer = podTemplate.containers.filter(c => c.name === "ingress-sds")[0]

          const certsLoadedOnIngress = _.flatten((await IstioFunctions.getIngressCerts(k8sClient))
                                        .filter(c => c.cert_chain)
                                        .map(c => c.cert_chain)
                                        .map(certChain => certChain instanceof Array ? certChain : [certChain]))

          if(!istioProxyContainer) {
            this.onStreamOutput && this.onStreamOutput(["", "proxy container not found in ingressgateway"])
            continue
          }

          const output: ActionOutput = []
          const gateways = await IstioPluginHelper.getIstioIngressGateways(k8sClient)
          const virtualServices = (await IstioFunctions.listAllIngressVirtualServices(k8sClient))
                  .map(vs => {
                    const routes = (vs.http || []).concat(vs.tls || []).concat(vs.tcp || []).filter(r => r.match)
                    return {
                      virtualService: vs,
                      routes: routes.map(r => {
                          return {
                            ports: r.match.map(m => m.port),
                            destinations: r.route.map(route => route.destination)
                          }
                        }),
                      hasPorts: _.flatten(routes.map(r => r.match))
                                .filter(m => m.port).map(m => m.port).length > 0
                    }
                  })

          const gatewaysUsingMountedCerts = gateways.map(g => {
            const relevantServers = g.servers.filter(server =>  server.tls && server.tls.privateKey && server.tls.privateKey.length > 0)
            return {
              gateway: g,
              servers: relevantServers,
              privateKeys: relevantServers.map(server =>  server.tls.privateKey)
            }
          })
          .filter(g => g.servers.length > 0)

          const gatewaysUsingSDSCerts = gateways.map(g => {
            const relevantServers = g.servers.filter(server =>  server.tls && server.tls.credentialName && server.tls.credentialName.length > 0)
            return {
              gateway: g,
              servers: relevantServers,
              secrets: relevantServers.map(server =>  server.tls.credentialName)
            }
          })
          .filter(g => g.servers.length > 0)

          const outputRelatedVirtualServices = g => {
            const gatewayHosts = _.flatten(g.servers.map(server => server.hosts))
                                  .map(host => host.replace("*.", ""))
            const gatewayPorts = g.servers.map(server => server.port)

            const relatedVirtualServices = virtualServices
            .filter(vs => vs.virtualService.gateways.includes(g.gateway.name))
            .filter(vs => vs.virtualService.hosts.filter(vsh => vsh === "*" || 
                          gatewayHosts.filter(gh => gh === "*" || vsh.includes(gh)).length > 0).length > 0)
            .map(vs => {
              return {
                name: vs.virtualService.name,
                hosts: vs.virtualService.hosts,
                routes: vs.hasPorts ? 
                          vs.routes.filter(r => 
                            r.ports.filter(vsp => 
                              gatewayPorts.filter(gp => gp.includes(vsp)).length > 0
                            ).length > 0)
                          : vs.routes
              }
            })
            .filter(vs => vs.routes.length > 0)
            output.push([">>>Related VirtualService Routes",""])
            relatedVirtualServices.length === 0 && output.push(["No Related VirtualServices",""])
            relatedVirtualServices.forEach(vs => 
              output.push([vs.name, {hosts: vs.hosts, routes: vs.routes}]))
            output.push([])
          }

          if(gatewaysUsingSDSCerts.length > 0 && !istioSDSContainer) {
            output.push([">>Gateways using SDS certs but no SDS container",""])
          } else {
            output.push([">>Gateways using SDS certs",""])
          }
          gatewaysUsingSDSCerts.length === 0 && output.push(["No Gateways",""])
          gatewaysUsingSDSCerts.forEach(g => {
            output.push([">>>Gateway: "+g.gateway.name + " (Namespace: "+g.gateway.namespace+")",""])
            g.servers.forEach(server => {
              output.push(
                [server.tls.credentialName, 
                  {
                    hosts: server.hosts,
                    port: server.port,
                    mode: server.tls.mode,
                    credentialName: server.tls.credentialName
                  }
                ],
              )
            })
            outputRelatedVirtualServices(g)
          })

          output.push([])
          output.push([">>Gateways using mounted certs",""])
          gatewaysUsingMountedCerts.length === 0 && output.push(["No Gateways",""])

          gatewaysUsingMountedCerts.forEach(g => {
            output.push([">>>Gateway: "+g.gateway.name + " (Namespace: "+g.gateway.namespace+")",""])
            g.servers.forEach(server => {
              const pieces = server.tls.serverCertificate.split("/")
              const dir = pieces.slice(0, pieces.length-1).join("/")
              pieces[pieces.length-1] = pieces[pieces.length-1].split(".")[0]
              const certId = pieces.slice(-2).join("/")
              const ingressVolumeMount = istioProxyContainer.volumeMounts ? 
                          istioProxyContainer.volumeMounts.filter(mount => mount.mountPath.includes(dir))[0] : ""
              const certInfoFromIngress = certsLoadedOnIngress.filter(c => (c.path || c).includes(certId))
              output.push(
                [certId, 
                  {
                    hosts: server.hosts,
                    port: server.port,
                    mode: server.tls.mode,
                    serverCertificate: server.tls.serverCertificate,
                    privateKey: server.tls.privateKey,
                    ingressGatewayVolume: ingressVolumeMount ? ingressVolumeMount.name : "Cert Not Mounted",
                    certInfoFromIngress: certInfoFromIngress || "N/A"
                  }
                ],
                []
              )
            })
            outputRelatedVirtualServices(g)

          })
          this.onStreamOutput  && this.onStreamOutput(output)
        }
        this.showOutputLoading && this.showOutputLoading(false)
      },
    }
  ]
}

export default plugin
