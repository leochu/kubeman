import k8sFunctions from '../../src/k8s/k8sFunctions'
import {ActionGroupSpec, ActionContextType, 
  ActionOutput, ActionOutputStyle, } from '../../src/actions/actionSpec'

function generatePodEventsOutput(podsMap) {
  const output: ActionOutput = []
  output.push([
    ["Event", "LastTimestamp", "(Count)"],
    "Details"
  ])

  Object.keys(podsMap).forEach(cluster => {
    const namespaces = Object.keys(podsMap[cluster])
    namespaces.forEach(namespace => {
      output.push([">Cluster: "+cluster + ", Namespace: "+namespace, "", ""])

      const pods = Object.keys(podsMap[cluster][namespace])
      if(pods.length === 0) {
        output.push(["No pods selected", "", ""])
      } else {
        pods.forEach(pod => {
          output.push([">>Pod: "+pod, "", ""])
          const events = podsMap[cluster][namespace][pod]
          events.forEach(event => output.push([
            [event.reason, event.lastTimestamp, "(" + event.count + ")"],
            [
              "type: " + event.type,
              "source: " + event.source,
              "message: " + event.message,
            ],
          ]))
        })
      }
    })
  })
  return output
}


const plugin : ActionGroupSpec = {
  context: ActionContextType.Pod,
  actions: [
    {
      name: "Get Pod Events",
      order: 1,
      async act(actionContext) {
        const clusters = actionContext.getClusters()
        const namespaces = actionContext.getNamespaces()
        const pods = actionContext.getPods()
        const k8sClients = actionContext.getK8sClients()

        const podsMap = {}
        for(const c in clusters) {
          const cluster = clusters[c]
          podsMap[cluster.name] = {}
          const clusterNamespaces = namespaces.filter(ns => ns.cluster.name === cluster.name)
          for(const n in clusterNamespaces) {
            const namespace = clusterNamespaces[n]
            podsMap[cluster.name][namespace.name] = {}

            const podNames = pods.filter(pod => pod.namespace.cluster.name === cluster.name)
                          .filter(pod => pod.namespace.name === namespace.name)
                          .map(pod => pod.name)
            for(const p in podNames) {
              const pod = podNames[p]
              podsMap[cluster.name][namespace.name][pod] = 
                  await k8sFunctions.getPodEvents(namespace.name, pod, k8sClients[c])
              const output = generatePodEventsOutput(podsMap)
              actionContext.onOutput && actionContext.onOutput(output, ActionOutputStyle.Table)
            }
          }
        }
      }
    }
  ]
}

export default plugin