import _ from 'lodash'
import {Cluster, Namespace} from "../k8s/k8sObjectTypes";
import * as k8s from '../k8s/k8sClient'


export class NamespaceContext {
}

export class ClusterContext {
  _namespaces: Map<Namespace, NamespaceContext> = new Map()

  clear() {
    this._namespaces.clear()
  }

  addNamespace(namespace: Namespace) {
    this._namespaces.set(namespace, new NamespaceContext)
  }

  addNamespaces(namespaces: Namespace[]) {
    namespaces.forEach(this.addNamespace.bind(this))
  }

  namespace(namespace: Namespace) : NamespaceContext|undefined {
    return this._namespaces.get(namespace)
  }

  namespaces() : Namespace[] {
    return Array.from(this._namespaces.keys())
  }
}


export default class Context {
  private clusterMap: Map<string, [Cluster, ClusterContext]> = new Map
  hasClusters: boolean = false
  hasNamespaces: boolean = false
  selections: any[] = []
  cachedSelections = {}
  cacheKey: string = ''
  errorMessage: string = ''

  updateFlags() {
    this.hasClusters = this.clusterMap.size > 0
    this.hasNamespaces = this.namespaces.length > 0
  }

  async store(clusters: Map<string, Cluster>, namespaces: Map<string, Namespace>) {
    await this.storeClusters(clusters)
    this.storeNamespaces(namespaces)
  }

  private async storeClusters(clusters: Map<string, Cluster>) {
    this.clear()
    for(const cluster of clusters.values()) {
      await this.addCluster(cluster)
    }
  }

  private storeNamespaces(namespaces: Map<string, Namespace>) {
    namespaces.forEach(ns => this.addNamespace(ns))
  }

  private clear() {
    this.clusterMap.forEach(clusterRec => clusterRec[0].namespaces = [])
    this.clusterMap.clear()
    this.updateFlags()
  }

  async addCluster(cluster: Cluster) {
    cluster.clearNamespaces()
    cluster.k8sClient = await k8s.getClientForCluster(cluster)
    this.clusterMap.set(cluster.name, [cluster, new ClusterContext])
    this.updateFlags()
  }

  addNamespace(namespace: Namespace) {
    const clusterRec = this.clusterMap.get(namespace.cluster.name)
    const clusterContext = clusterRec && clusterRec[1]
    if(!clusterContext) {
      console.log("Cluster %s not found for ns %s", namespace.cluster.name, namespace.name)
      throw new ReferenceError("Cluster not found: " + namespace.cluster)
    }
    namespace.cluster.namespaces.push(namespace)
    clusterContext.addNamespace(namespace)
    this.updateFlags()
  }

  get clusters() : Cluster[] {
    return Array.from(this.clusterMap.values()).map(rec => rec[0])
  }

  cluster(clusterName: string) {
    const clusterRec = this.clusterMap.get(clusterName)
    return clusterRec && clusterRec[0]
  }

  get namespaces() : Namespace[] {
    return _.flatMap(Array.from(this.clusterMap.values()), rec => rec[0].namespaces)
  }

  namespace(clusterName: string, nsName: string) {
    const cluster = this.cluster(clusterName)
    const namespaces = cluster && cluster.namespaces.filter(ns => ns.name === nsName)
    return namespaces && namespaces.length > 0 && namespaces[0]
  }
}