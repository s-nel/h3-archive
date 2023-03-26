import React from 'react'
import * as d3 from 'd3'
import { DateTime } from 'luxon'
import { useSelector } from 'react-redux'
import { 
  EuiFlexGroup,
  EuiFlexItem,
  EuiLoadingChart,
  Query,
} from '@elastic/eui'
import {
  categoryColor
} from './Info'
import _ from 'lodash'

export const height = 300

const initSim = _.debounce((data, simulation) => {
  simulation.force("collide").initialize(data)
}, 50)

const Chart = ({ setInfo, info, query }) => {
  const width = 2000
  const marginTop = 10
  const marginRight = 20
  const marginBottom = 30
  const marginLeft = 20
  const hoverRadius = 16

  const [fixed, setFixed] = React.useState(!!info)
  const [isLoading, setLoading] = React.useState(true)
  const rootRef = React.useRef(null)
  const unfilteredEvents = useSelector(state => state.events.value)
  const [eventsSize, setEventsSize] = React.useState(0)
  const [svg] = React.useState(d3.create("svg")
    .attr("width", "100%")
    .attr("height", height)
    .attr("viewBox", [0, 0, width, height])
    .attr("style", "max-width: 100%; height: auto; height: intrinsic;"))

  const ticked = () => {
    if (Date.now() % 3 === 0) {
      svg.selectAll(".circ")
        .attr("cx", d => d.x)
        .attr("cy", d => d.y)
        //.attr("r", d => d.size)
    }
  }

  let events
  if (query) {
    events = Query.execute(query, unfilteredEvents.map(e => ({
      ...e,
      person: e.people.map(p => p.person_id),
      date: e.start_date,
    })))
  } else {
    events = unfilteredEvents
  }

  const domainMin = events && events.length > 0 ? events.reduce((acc, e) => e.start_date < acc ? e.start_date : acc, DateTime.now().toMillis()) : 1362096000000

  const xDomain = [domainMin, DateTime.now().toMillis()]
  const xRange = [marginLeft, width - marginRight]
  const xTickFormat = d => DateTime.fromMillis(d).toLocaleString(DateTime.DATE_SHORT)

  const [simulation, data] = React.useMemo(() => {
    const data = events && events.map(e => {
      const datum = {
        time: e.start_date,
        color: categoryColor[e.category],
        size: radiuses[e.category] + 2,
        event: e,
      }
      return datum
    })
    const xScale = d3.scaleLinear(xDomain, xRange)
    const simulation = d3.forceSimulation(data)
      .force("x", d3.forceX(d => xScale(d.time)).strength(1))
      .force("y", d3.forceY((marginTop + height - marginBottom) / 2).strength(d => weights[d.event.category]))
      .force("collide", d3.forceCollide(d => d.size))
      .alphaDecay(0)
      .alpha(0.3)
      .on("tick", ticked)
    simulation.tick(400)
    return [simulation, data]
  }, [query && query.text])

  const xScale = d3.scaleLinear(xDomain, xRange);
  const xAxis = d3.axisBottom(xScale).tickFormat(d => xTickFormat(d)).tickSizeOuter(0)
  const xAxisLines = d3.axisBottom(xScale).tickFormat('').tickSizeOuter(0).tickSizeInner(-height + marginTop + marginBottom)

  svg.selectAll('*').remove()

  if (data) {
    initSim(data, simulation)

    svg.append("g")
      .attr("transform", `translate(0,${height - marginBottom})`)
      .call(xAxis)
      .call(g => g.append("text")
          .attr("x", width)
          .attr("y", marginBottom - 4)
          .attr("fill", "currentColor")
          .attr("text-anchor", "end")
          .text(''))

    const axisLines = svg.append("g")
      .attr("transform", `translate(0,${height - marginBottom})`)
      .style("stroke-dasharray", "5 5")
      .call(xAxisLines)
    axisLines
      .selectAll('line')
      .style("stroke", "#555")

    data.forEach(d => {
      if (info && d.event.event_id === info.event_id) {
        d.size = hoverRadius + 3
      } else {
        d.size = radiuses[d.event.category] + 1
      }
    })
    svg.append("g")
      .selectAll(".circ")
      .data(data)
      .enter()
      .append("circle") 
        .attr("class", "circ")
        .attr("stroke", "white")
        .attr("stroke-width", d => info && d.event.event_id === info.event_id ? 3 : 1)
        .attr("fill", d => d.color)
        .attr("r", d => info && d.event.event_id === info.event_id ? hoverRadius : radiuses[d.event.category])
        .attr("cx", d => d.x)
        .attr("cy", d => d.y)
        .on('mouseenter', (e, d, i) => {
          e.preventDefault()
          if (!fixed) {
            d3.select(this).raise()
            hover(setInfo, fixed)(d.event)
          }
        })
        .on('click', (e, d) => {
          toggleSelected(setFixed, setInfo, fixed)(d.event)
        })
    if (isLoading) {
      setLoading(false)
    }
  }

  React.useEffect(() => {
      const rootEl = d3.select(rootRef.current)
      rootEl.append(() => svg.node())
  }, [setEventsSize, eventsSize, events, setInfo, fixed, setFixed, info])

  if (isLoading) {
    return (<EuiFlexGroup
      style={{
        maxWidth: '100%',
        height: `${height}px`,
      }}
      alignItems="center"
      justifyContent="center"
    >
      <EuiFlexItem grow={false}>
        <EuiLoadingChart size="xl" />
      </EuiFlexItem>
    </EuiFlexGroup>)
  }
    
  return (<div ref={rootRef}></div>);
}

const toggleSelected = (setFixed, setInfo, fixed) => (e) => {
  setInfo(e)
  setFixed(!fixed)
}

const hover = (setInfo) => d => {
  setInfo(d)
}

const weights = {
  podcast: 0.02,
  video: 0.02,
  major: 0.04,
  controversy: 0.04,
}

const radiuses = {
  podcast: 6,
  video: 6,
  major: 9,
  controversy: 9,
}

export default Chart;
