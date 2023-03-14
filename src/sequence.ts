import { randomNormal } from 'd3-random'

export type ModelNode = {
  label: string
  context: Context
  children?: ModelNode[]
  simulate: (
    this: ModelNode,
    startTime: number,
    parentSpan?: Span,
  ) => {
    endTime: number
    spans: Span[]
  }
}

export interface Context {
  service: string
}

export interface Span {
  modelNode: ModelNode
  startTime: number
  endTime: number
  parentSpan?: Span
  childrenSpans?: Span[]
  annotations?: Annotation[]
}

export interface Annotation {
  time: string
  label: string
}

export interface Trace {
  spans: Span[]
}

export interface ModelNodeBuilder {
  (parentContext: Context): ModelNode
}

// ----- base simulator generators

export function normalNode({
  mean,
  stdDev,
  label,
  includeSpan = true,
  context,
}: {
  mean: number
  stdDev: number
  label: string
  includeSpan?: boolean
  context?: Partial<Context>
}): ModelNodeBuilder {
  return (parentContext: Context): ModelNode => {
    const combinedContext = { ...parentContext, ...context }
    return {
      label,
      context: combinedContext,
      simulate: function (
        this: ModelNode,
        startTime: number,
        parentSpan?: Span,
      ) {
        const Δ = randomNormal(mean, stdDev)()
        const endTime = startTime + Δ
        return {
          endTime,
          spans: includeSpan
            ? [
                {
                  startTime,
                  endTime,
                  modelNode: this,
                  parentSpan,
                },
              ]
            : [],
        }
      },
    }
  }
}

export function constantNode({
  duration,
  label,
  includeSpan = true,
  context,
}: {
  duration: number
  label: string
  includeSpan?: boolean
  context?: Partial<Context>
}): ModelNodeBuilder {
  return (parentContext: Context): ModelNode => {
    const combinedContext = { ...parentContext, ...context }
    return {
      label,
      context: combinedContext,
      simulate: function (
        this: ModelNode,
        startTime: number,
        parentSpan?: Span,
      ) {
        const endTime = startTime + duration
        return {
          endTime,
          spans: includeSpan
            ? [
                {
                  startTime,
                  endTime,
                  modelNode: this,
                  parentSpan,
                },
              ]
            : [],
        }
      },
    }
  }
}

export function serial({
  children,
  label,
  includeSpan,
  context,
}: {
  label: string
  children: ModelNodeBuilder[]
  /** Whether to include a span for this node in the trace. */
  includeSpan: boolean
  context?: Partial<Context>
}): ModelNodeBuilder {
  return (parentContext: Context) => {
    const combinedContext = { ...parentContext, ...context }
    const childrenNodes = children.map((child) => child(combinedContext))

    return {
      simulate: function (
        this: ModelNode,
        startTime: number,
        parentSpan?: Span,
      ) {
        const span = includeSpan ? ({} as Span) : null
        let t = startTime
        const childrenSpans = childrenNodes
          .map((child: ModelNode) => {
            const { spans, endTime } = child.simulate(t, span || parentSpan)
            t = endTime
            return spans
          })
          .flat()
          .filter(Boolean)
        const endTime = t

        return {
          startTime,
          endTime,
          spans: span
            ? [
                Object.assign(span, {
                  modelNode: this,
                  startTime,
                  endTime,
                  parentSpan,
                  childrenSpans,
                }),
              ]
            : childrenSpans,
        }
      },
      label,
      childrenNodes,
      context: combinedContext,
      includeSpan,
    }
  }
}

export function parallel({
  children,
  label,
  context,
  includeSpan = false,
}: {
  label: string
  children: ModelNodeBuilder[]
  context?: Partial<Context>
  /** Whether to include a span for this node in the trace. */
  includeSpan?: boolean
}): ModelNodeBuilder {
  return (parentContext: Context) => {
    const combinedContext = { ...parentContext, ...context }
    const childrenNodes = children.map((child) => child(combinedContext))

    return {
      simulate: function (
        this: ModelNode,
        startTime: number,
        parentSpan?: Span,
      ) {
        const span = includeSpan ? ({} as Span) : null
        let t = startTime
        const childSimulateResults = childrenNodes.map((child) =>
          child.simulate(t, span || parentSpan),
        )
        const endTime = Math.max(
          ...childSimulateResults.map(({ endTime }) => endTime),
        )
        const childrenSpans = childSimulateResults
          .map(({ spans }) => spans)
          .flat()
          .filter(Boolean)

        return {
          startTime,
          endTime,
          spans: span
            ? [
                Object.assign(span, {
                  modelNode: this,
                  startTime,
                  endTime,
                  parentSpan,
                  childrenSpans,
                }),
              ]
            : childrenSpans,
        }
      },
      label,
      childrenNodes,
      context: combinedContext,
      includeSpan,
    }
  }
}

// ----- simulator

export function simulate(rootNodeBuilder: ModelNodeBuilder): Trace {
  const rootNode = rootNodeBuilder({ service: 'root' })

  const { spans: rootSpans } = rootNode.simulate(0)

  if (rootSpans.length !== 1) {
    throw new Error('Root spans should be 1')
  }

  const rootSpan = rootSpans[0]

  // gather a DFS traversal of the spans:
  const spans: Span[] = []
  function dfs(span: Span) {
    spans.push(span)
    if (span.childrenSpans) {
      span.childrenSpans.forEach(dfs)
    }
  }
  dfs(rootSpan)

  const trace: Trace = { spans }
  return trace
}

// ----- debug utils

export function logTrace(trace: Trace) {
  console.table(
    trace.spans.map((span) => ({
      label: span.modelNode.label,
      startTime: span.startTime,
      endTime: span.endTime,
      hasParentSpan: span.parentSpan,
      parentSpanName: span.parentSpan?.modelNode?.label,
      context: span.modelNode.context,
    })),
  )
}

export function logTraceTree(trace: Trace) {
  function inner(span: Span, indent: number) {
    const prefix = ' '.repeat(indent)
    console.log(
      `${prefix}${span.modelNode.label} ${span.startTime} ${span.endTime}`,
    )
    if (span.childrenSpans) {
      span.childrenSpans.forEach((childSpan) => inner(childSpan, indent + 2))
    }
  }
  inner(trace.spans[0], 0)
}

// ----- example
