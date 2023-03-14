'use client'

import { Span, Trace } from '@/sequence'
import { forwardRef, Fragment, useCallback, useMemo } from 'react'
import { TimeMode } from '@/app/page'
import { scaleOrdinal } from 'd3-scale'
import { schemePastel1 } from 'd3-scale-chromatic'

type DiagramLayout = {
  services: Map<
    string,
    {
      name: string
      spanToRowAssignment: Map<Span, number>
      rightEdges: number[]
      yOffset: number
      height: number
    }
  >
  spanToY: (span: Span) => number
  timeToXAssignment: Map<number, number>
  lastTime: number
}

const rowHeight = 40
const servicePadding = 10

export function layoutDiagram(spans: Span[]): DiagramLayout {
  const services = new Map()

  const uniqueTimes = new Set<number>()

  for (const span of spans) {
    uniqueTimes.add(span.startTime)
    uniqueTimes.add(span.endTime)
  }
  const sortedTimes = Array.from(uniqueTimes).sort((a, b) => a - b)
  const timeToXAssignment = new Map(
    sortedTimes.map((time, i) => [time, i * 50] as [number, number]),
  )

  function getOrCreateService(name: string) {
    const serviceLayout = services.get(name) || {
      name,
      spanToRowAssignment: new Map(),
      rightEdges: [0],
      yOffset: 0, // to be updated
      height: 0,
    }
    services.set(name, serviceLayout)
    return serviceLayout
  }

  for (const span of spans) {
    const service = span.modelNode.context.service
    const serviceLayout = getOrCreateService(service)

    let row = 0
    while (serviceLayout.rightEdges[row] > span.startTime) {
      row++
    }
    serviceLayout.rightEdges[row] = span.endTime
    serviceLayout.spanToRowAssignment.set(span, row)
  }

  let yOffset = 0
  for (const serviceLayout of Array.from(services.values())) {
    serviceLayout.yOffset = yOffset
    serviceLayout.height =
      serviceLayout.rightEdges.length * rowHeight + servicePadding
    yOffset += serviceLayout.height
  }

  const spanToY = function (span: Span) {
    const serviceLayout = services.get(span.modelNode.context.service)!
    return (
      serviceLayout.yOffset +
      serviceLayout.spanToRowAssignment.get(span)! * rowHeight
    )
  }

  const lastTime = sortedTimes[sortedTimes.length - 1]

  return {
    services,
    timeToXAssignment,
    spanToY,
    lastTime,
  }
}

export const headingHeight = 40
const leftMargin = 200
const rightMargin = 100

interface NonRefProps {
  trace: Trace
  timeMode: TimeMode
  scale: number
  setScale: React.Dispatch<React.SetStateAction<number>>
}

const arrowColor = '#666'

export const TraceGraph = forwardRef<SVGSVGElement, NonRefProps>(
  function TraceGraphInner({ trace, timeMode, scale, setScale }, svgRef) {
    const layout = useMemo(() => layoutDiagram(trace.spans), [trace])

    const xScale = useCallback(
      (time: number): number =>
        timeMode === 'linear'
          ? time * scale
          : layout.timeToXAssignment.get(time)! * scale,
      [timeMode, scale, layout.timeToXAssignment],
    )

    const colorScale = scaleOrdinal(schemePastel1)

    // hack for consistent colors!:
    ;[('browser', 'dotcom', 'alloy', 'cdn')].forEach((service) =>
      colorScale(service),
    )

    const svgHeight =
      headingHeight +
      Array.from(layout.services.values()).reduce(
        (acc, service) => acc + service.height,
        0,
      ) +
      1

    const svgWidth = xScale(layout.lastTime) + leftMargin + rightMargin

    return (
      <div
        style={{
          width: '100vw',
          overflowX: 'scroll',
          overflowY: 'clip',
        }}
      >
        <figure className="inline-block">
          <svg
            ref={svgRef}
            height={svgHeight}
            width={svgWidth}
            style={{ background: 'white', display: 'block' }}
          >
            <defs>
              <marker
                id="triangle"
                viewBox="0 0 6 6"
                refX="6"
                refY="3"
                markerUnits="strokeWidth"
                markerWidth="6"
                markerHeight="6"
                fill={arrowColor}
                orient="auto"
              >
                <path d="M 0 0 L 6 3 L 0 6 z" />
              </marker>
            </defs>
            <text
              x={leftMargin - 10}
              y={30}
              fontSize={12}
              fill="#999"
              textAnchor="end"
              style={{ fontStyle: 'italic' }}
            >
              time ({timeMode === 'linear' ? 'ms' : 'non-linear'}) →
            </text>
            <g transform={`translate(0, ${headingHeight})`}>
              {/* label the time axis: */}
              {/* draw a horizontal line between services, and include labels: */}
              <line x1={0} y1={0} x2={svgWidth} y2={0} stroke="#ccc" />
              {Array.from(layout.services.values()).map((service) => (
                <Fragment key={service.name}>
                  <line
                    x1={0}
                    y1={service.yOffset + service.height}
                    x2={svgWidth}
                    y2={service.yOffset + service.height}
                    stroke="#ccc"
                  />
                  <rect
                    x={0}
                    y={service.yOffset}
                    width={6}
                    height={service.height}
                    fill={colorScale(service.name)}
                  />
                  <text
                    x={20}
                    y={service.yOffset + 30}
                    fontSize={16}
                    fill="#999"
                    textAnchor="start"
                    style={{ letterSpacing: '0.1em' }}
                  >
                    {service.name.toUpperCase()}
                  </text>
                </Fragment>
              ))}
              <g transform={`translate(${leftMargin}, 0)`}>
                {/* draw ticks from 0 to the end of the trace: */}
                <Ticks timeMode={timeMode} xScale={xScale} layout={layout} />
                {trace.spans.map((span: Span, i) => {
                  const childIsBelowParent: Boolean = span.parentSpan
                    ? layout.spanToY(span) > layout.spanToY(span.parentSpan)
                    : false
                  return (
                    <Fragment key={i}>
                      <rect
                        x={xScale(span.startTime)}
                        y={layout.spanToY(span) + 10}
                        width={xScale(span.endTime) - xScale(span.startTime)}
                        height={30}
                        rx={3}
                        ry={3}
                        fill={colorScale(span.modelNode.context.service)}
                        id={`rect-${i}`}
                      />
                      <text
                        x={xScale(span.startTime) + 6}
                        y={layout.spanToY(span) + 31}
                        fontSize={16}
                        fill="black"
                        width={xScale(span.endTime) - xScale(span.startTime)}
                      >
                        {span.modelNode.label}
                      </text>
                      {span.parentSpan && (
                        <>
                          {/* Arrow from parent to start of span: */}
                          <line
                            x1={xScale(span.startTime)}
                            y1={
                              layout.spanToY(span.parentSpan) +
                              (childIsBelowParent ? 40 : 10)
                            }
                            x2={xScale(span.startTime) /*+ 2*/}
                            y2={
                              layout.spanToY(span) +
                              (childIsBelowParent ? 10 : 40)
                            }
                            stroke={arrowColor}
                            strokeWidth={2}
                            markerEnd="url(#triangle)"
                          />
                          {/* Arrow from end of span back to parent: */}
                          <line
                            x1={xScale(span.endTime) /*- 2*/}
                            y1={
                              layout.spanToY(span) +
                              (childIsBelowParent ? 10 : 40)
                            }
                            x2={xScale(span.endTime)}
                            y2={
                              layout.spanToY(span.parentSpan) +
                              (childIsBelowParent ? 40 : 10)
                            }
                            stroke={arrowColor}
                            strokeWidth={2}
                            markerEnd="url(#triangle)"
                          />
                        </>
                      )}
                    </Fragment>
                  )
                })}
              </g>
            </g>
          </svg>
        </figure>
      </div>
    )
  },
)

export function Ticks({
  timeMode,
  xScale,
  layout,
}: {
  timeMode: TimeMode
  xScale: (time: number) => number
  layout: DiagramLayout
}) {
  return (
    <>
      {timeMode === 'linear' ? (
        <>
          {Array.from({ length: layout.lastTime / 50 + 2 }).map((_, i) => (
            <Fragment key={i}>
              <line
                x1={xScale(i * 50)}
                y1={-20}
                x2={xScale(i * 50)}
                y2={1000000}
                stroke="#ccc"
                strokeWidth={1}
              />
              <text x={xScale(i * 50) + 3} y={-10} fontSize={12} fill="#999">
                {i * 50}ms
              </text>
            </Fragment>
          ))}
        </>
      ) : (
        <>
          {Array.from(layout.timeToXAssignment.entries()).map(
            ([time, x], i) => (
              <Fragment key={i}>
                <line
                  x1={xScale(time)}
                  y1={-20}
                  x2={xScale(time)}
                  y2={1000000}
                  stroke="#ccc"
                  strokeWidth={1}
                />
                <text x={xScale(time) + 3} y={-10} fontSize={12} fill="#999">
                  {i}
                </text>
              </Fragment>
            ),
          )}
        </>
      )}
    </>
  )
}
