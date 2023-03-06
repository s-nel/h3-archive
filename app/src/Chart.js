import React from 'react'
import * as d3 from 'd3'
import BeeswarmChart from "./BeeswarmChart"
import { DateTime } from 'luxon'
import { useSelector } from 'react-redux'


const Chart = ({ setInfo, info }) => {
  const [renderedData, setRenderedData] = React.useState([])
  const [fixed, setFixed] = React.useState(false)
  const rootRef = React.useRef(null)
  const events = useSelector(state => state.events.value)

  const toggleSelected = d => {
    setFixed(!fixed)
  }

  const hover = d => {
    if (!fixed) {
      setInfo(d)
    }
  }

  const colors = {
    podcast: "#32cf69",
    video: "#eb635b",
  }

  const chart = BeeswarmChart(events, {
    x: d => d.start_date,
    xLabel: '',
    title: d => d.name,
    width: "2000",
    xFillColor: d => colors[d.category],
    xStrokeColor: d => '#ffffff',
    xTickFormat: d => DateTime.fromMillis(d).toLocaleString(DateTime.DATE_SHORT),
    radius: 6,
    hoverRadius: 11,
    height: 300,
    hover: d => hover(d),
    xDomain: [1362096000000, DateTime.now().toMillis()],
    onClick: d => toggleSelected(d),
    selected: info,
  })

  React.useEffect(() => {
      const rootEl = d3.select(rootRef.current)
      rootEl.selectAll('*').remove()
      rootEl.append(() => chart)
      setRenderedData(events)
  }, [renderedData, events, chart, setInfo])
    
  return (<div ref={rootRef}></div>);
}

export default Chart;
