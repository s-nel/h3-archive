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

  React.useEffect(() => {
      const domainMin = events && events.length > 0 ? events.reduce((acc, e) => e.start_date < acc ? e.start_date : acc, DateTime.now().toMillis()) : 1362096000000

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
        hover: d => hover(setInfo, fixed)(d),
        xDomain: [domainMin, DateTime.now().toMillis()],
        onClick: d => toggleSelected(setFixed, fixed)(d),
        selected: info,
      })

      const rootEl = d3.select(rootRef.current)
      rootEl.selectAll('*').remove()
      rootEl.append(() => chart)
      setRenderedData(events)
  }, [renderedData, events, setInfo, fixed, setFixed, info])
    
  return (<div ref={rootRef}></div>);
}

const toggleSelected = (setFixed, fixed) => () => {
  setFixed(!fixed)
}

const hover = (setInfo, fixed) => d => {
  if (!fixed) {
    setInfo(d)
  }
}

const colors = {
  podcast: '#32cf69',
  video: '#5bd9d9',
  major: '#e375eb',
  controversy: '#eb635b',
}

export default Chart;
