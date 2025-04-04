import { V1Ingress, V1IngressRule, V1Service} from "@kubernetes/client-node";

interface IngressDefinition {
  name: string;
  namespace: string;
  rules: Array<{
    host: string,
    path: string,
    service: V1Service,
    port: number
  }>
}

// apiVersion: networking.k8s.io/v1
// kind: Ingress
// metadata:
//   name: minimal-ingress
//   annotations:
//     nginx.ingress.kubernetes.io/rewrite-target: /
// spec:
//   ingressClassName: nginx-example
//   rules:
//   - host: "foo.bar.com"
//     http:
//       paths:
//       - path: /testpath
//         pathType: Prefix
//         backend:
//           service:
//             name: test
//             port:
//               number: 80

export default function createIngress({ name, namespace, rules }: IngressDefinition): V1Ingress {
  return {
    apiVersion: 'networking.k8s.io/v1',
    kind: 'Ingress',
    metadata: {
      name,
      namespace,
    },
    spec: {
      rules: rules.map(rule => ({
        host: rule.host,
        http: {
          paths: [{
            path: "/",
            pathType: "Prefix",
            backend: {
              service: {
                name: rule.service.metadata?.name!,
                port: {number: rule.port}
              }
            }
          }]
        }
      } satisfies V1IngressRule))
    }
    // data: valuesToString(data)
  };
}
