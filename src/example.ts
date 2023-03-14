import {
  constantNode,
  Context,
  ModelNodeBuilder,
  normalNode,
  parallel,
  serial,
} from './sequence'

const defaultDuration = 100

// --- Utilities:

function gap(duration: number = defaultDuration) {
  return constantNode({ duration, label: 'gap', includeSpan: false })
}

function wrapWithConstantOverhead({
  label,
  children,
  overhead,
  includeSpan,
  context,
}: {
  label: string
  children: ModelNodeBuilder[]
  overhead: number
  includeSpan: boolean
  context?: Partial<Context>
}): ModelNodeBuilder {
  const childrenForSerial: ModelNodeBuilder[] = [gap(overhead)]
  for (const child of children) {
    childrenForSerial.push(child)
    childrenForSerial.push(gap(overhead))
  }
  return serial({
    label,
    children: childrenForSerial,
    includeSpan,
    context,
  })
}

function call(
  label: string,
  ...children: ModelNodeBuilder[]
): ModelNodeBuilder {
  return wrapWithConstantOverhead({
    label,
    children,
    overhead: defaultDuration,
    includeSpan: true,
  })
}

function serviceCall(
  serviceName: string,
  methodName: string,
  ...children: ModelNodeBuilder[]
): ModelNodeBuilder {
  return wrapWithConstantOverhead({
    label: `${methodName}`,
    children,
    overhead: defaultDuration,
    includeSpan: true,
    context: { service: serviceName },
  })
}

function hiddenParallel(...children: ModelNodeBuilder[]) {
  return parallel({
    label: '',
    children,
    includeSpan: false,
  })
}

export const exampleModel = browserPageLoad(
  internetOverhead(
    glb(
      'GET /foo',
      wrapWithConstantOverhead({
        label: 'GET /foo',
        includeSpan: true,
        overhead: 0,
        children: [
          sameDataCenter(
            constantNode({
              context: { service: 'DB' },
              duration: 300,
              label: '[fetch data]',
            }),
          ),
          sameDataCenter(
            wrapWithConstantOverhead({
              label: 'POST /render',
              context: { service: 'SSR' },
              children: [
                glb(
                  'GET /handler.js',
                  constantNode({
                    duration: 50,
                    label: 'GET server-bundle.js',
                    context: { service: 'CDN' },
                  }),
                ),
                constantNode({
                  duration: 200,
                  label: 'renderToString()',
                }),
              ],
              overhead: 40,
              includeSpan: true,
            }),
          ),
        ],
        context: { service: 'Monolith' },
      }),
    ),
  ),
  serial({
    label: 'Loading',
    includeSpan: false,
    children: [
      gap(20),
      internetOverhead(assetRequest('GET client-bundle.js')),
      gap(5),
      constantNode({ label: 'hydrate()', duration: 50 }),
      gap(5),
    ],
  }),
)

function internetOverhead(child: ModelNodeBuilder): ModelNodeBuilder {
  return wrapWithConstantOverhead({
    label: 'slow 3G overhead',
    children: [child],
    overhead: 15,
    includeSpan: false,
  })
}

function glb(label: string, child: ModelNodeBuilder): ModelNodeBuilder {
  return wrapWithConstantOverhead({
    label,
    children: [child],
    overhead: 10,
    includeSpan: false,
    context: { service: 'GLB' },
  })
}

function sameDataCenter(child: ModelNodeBuilder): ModelNodeBuilder {
  return wrapWithConstantOverhead({
    label: 'Same datacenter overhead',
    children: [child],
    overhead: 5,
    includeSpan: false,
  })
}

function assetRequest(label: string): ModelNodeBuilder {
  // return gfe(
  //   label,
  return constantNode({
    duration: 50,
    label,
    context: { service: 'CDN' },
  })
  // )
}

function monolith(label: string, ...children: ModelNodeBuilder[]) {
  return wrapWithConstantOverhead({
    label,
    context: { service: 'Monolith' },
    includeSpan: true,
    overhead: 0,
    children,
  })
}

function resolve() {
  return constantNode({
    label: 'Resolve GraphQL Query',
    duration: 300,
    includeSpan: true,
  })
}

function browserPageLoad(
  serverImpl: ModelNodeBuilder,
  loading: ModelNodeBuilder,
): ModelNodeBuilder {
  return wrapWithConstantOverhead({
    label: 'user navigates to /foo',
    children: [gap(20), internetOverhead(serverImpl), loading],
    overhead: 1,
    includeSpan: true,
    context: { service: 'Browser' },
  })
}
