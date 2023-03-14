'use client'

import { simulate } from '@/sequence'
import { exampleModel } from '@/example'
import { useMemo, useRef, useState } from 'react'
import { TraceGraph } from './TraceGraph'
import domtoimage from 'dom-to-image'
import { saveAs } from 'file-saver'

export type TimeMode = 'linear' | 'ordinal'

const availableModels = [
  {
    name: 'exampleModel',
    model: exampleModel,
  },
]

export default function Home() {
  const [availableModel, setAvailableModel] = useState(availableModels[0])
  const trace = useMemo(() => simulate(availableModel.model), [availableModel])

  const [timeMode, setTimeMode] = useState<TimeMode>('ordinal')
  const [scale, setScale] = useState(1)

  const svgRef = useRef<SVGSVGElement>(null)
  const onTimeModeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTimeMode(e.target.value as TimeMode)
  }

  return (
    <main>
      <div className="p-2 bg-gray-200 flex flex-row justify-start gap-2">
        {/* Dropdown to pick a trace: */}
        <div className="flex flex-row items-stretch border-2 border-white rounded gap-2 p-2">
          <strong>Model:</strong>
          <select
            onChange={(e) => {
              const availableModel = availableModels.find(
                (t) => t.name === e.target.value,
              )!
              setAvailableModel(availableModel)
            }}
          >
            {availableModels.map((availableModel) => (
              <option key={availableModel.name} value={availableModel.name}>
                {availableModel.name}
              </option>
            ))}
          </select>
        </div>
        {/* UI to toggle time mode: */}
        <div className="flex flex-row items-stretch border-2 border-white rounded gap-2 p-2">
          <strong>Timeline:</strong>
          <label className="border-r-2">
            <input
              onChange={onTimeModeChange}
              type="radio"
              name="timeMode"
              value="linear"
              checked={timeMode === 'linear'}
            />{' '}
            Linear
          </label>
          <label className="border-r-2">
            <input
              onChange={onTimeModeChange}
              type="radio"
              name="timeMode"
              value="ordinal"
              checked={timeMode === 'ordinal'}
            />{' '}
            Ordinal
          </label>
        </div>
        <div className="flex flex-row items-stretch border-2 border-white rounded gap-2 p-2">
          <strong>Scale:</strong>
          <input
            type="range"
            min="0.1"
            max="10"
            step="0.1"
            value={scale}
            onChange={(e) => setScale(parseFloat(e.target.value))}
          />
          <input
            type="number"
            min="0.1"
            max="10"
            value={scale}
            onChange={(e) => setScale(parseFloat(e.target.value))}
            className="px-2"
          />
        </div>
        <div className="flex flex-row items-stretch border-2 border-white rounded gap-2 p-2">
          <button
            value="Download"
            onClick={() => {
              // TODO
              domtoimage
                .toBlob(document.querySelector('figure')!)
                .then((blob) => {
                  console.log('>>> blob', blob)
                  saveAs(blob, 'trace.png')
                })
            }}
            // disabled={!svgRef.current}
          >
            💾 Download
          </button>
        </div>
      </div>
      <TraceGraph
        ref={svgRef}
        trace={trace}
        timeMode={timeMode}
        scale={scale}
        setScale={setScale}
      />
    </main>
  )
}
