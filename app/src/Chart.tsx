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
import axios from 'axios'

export const height = 300

// const initSim = _.debounce((data, simulation) => {
//   simulation.force("collide").initialize(data)
// }, 50)

const debouncedSetEvent = _.debounce((eventId, setEventId) => {
  setEventId(eventId)
}, 500)

const Chart = ({ setEventId, eventId, query, events, setEvents, isLoading, setLoading }) => {
  //console.log(unfilteredEvents, query)
  const width = 2000
  const marginTop = 10
  const marginRight = 20
  const marginBottom = 30
  const marginLeft = 20
  //const hoverRadius = 14

  const [tempEventId, setTempEventId] = React.useState(eventId)
  const [isEmpty, setEmpty] = React.useState(false)
  const [fixed, setFixed] = React.useState(!!eventId)
  const rootRef = React.useRef(null)
  const [eventsSize, setEventsSize] = React.useState(0)
  const [svg] = React.useState(d3.create("svg")
    .attr("width", "100%")
    .attr("height", height)
    .attr("viewBox", [0, 0, width, height])
    .attr("style", "max-width: 100%; height: auto; height: intrinsic;")
    .on('click', () => {
      setFixed(false) 
    }))

  React.useEffect(() => {
    fetchPage(query, events, setEvents, setLoading, setEmpty, setEventsSize)
  }, [query && query.text])

  React.useEffect(() => {
    debouncedSetEvent(tempEventId, setEventId)
  }, [tempEventId])

  React.useEffect(() => {
    setTempEventId(eventId)
  }, [eventId])

  const ticked = () => {
    if (Date.now() % 3 === 0) {
      svg.selectAll(".circ")
        .attr("cx", d => d.x)
        .attr("cy", d => d.y)
        //.attr("r", d => d.size)
    }
  }

  const domainMin = events && events.length > 0 ? events.reduce((acc, e) => e.start_date < acc ? e.start_date : acc, DateTime.now().toMillis()) : 1362096000000

  const xDomain = [domainMin, DateTime.now().toMillis()]
  const xRange = [marginLeft, width - marginRight]
  const viewsMin = 0 
  const viewsMax = events.reduce((acc, e) => {
    if (e.metrics) {
      return Math.max(e.metrics.views, acc)
    }
    return acc
  }, 0)
  const xTickFormat = d => DateTime.fromMillis(d).toLocaleString(DateTime.DATE_SHORT)

  const size = e => {
    if (e.category === 'podcast' || e.category === 'video') {
      if (e.metrics) {
        return radiuses[e.category][0] + (radiuses[e.category][1] - radiuses[e.category][0]) * (e.metrics.views / viewsMax)
      }
      return radiuses[e.category][0]
    }
    return radiuses[e.category]
  }

  const [simulation, data] = React.useMemo(() => {
    const data = events && events.map(e => {
      const datum = {
        time: e.start_date,
        color: categoryColor[e.category],
        size: size(e) + 1,
        event: e,
      }
      return datum
    })
    const xScale = d3.scaleLinear(xDomain, xRange)
    const simulation = d3.forceSimulation(data)
      .force("x", d3.forceX(d => xScale(d.time)).strength(1))
      .force("y", d3.forceY((marginTop + height - marginBottom) / 2).strength(d => weights[d.event.category]))
      .force("collide", d3.forceCollide(d => d.size))
      .alphaDecay(0.001)
      .alpha(0.3)
      .alphaMin(0.001)
      .on("tick", ticked)
    simulation.tick(600)
    return [simulation, data]
  }, [eventsSize, events])

  const xScale = d3.scaleLinear(xDomain, xRange);
  const xAxis = d3.axisBottom(xScale).tickFormat(d => xTickFormat(d)).tickSizeOuter(0)
  const xAxisLines = d3.axisBottom(xScale).tickFormat('').tickSizeOuter(0).tickSizeInner(-height + marginTop + marginBottom)

  svg.selectAll('*').remove()

  if (data) {
    //initSim(data, simulation)

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
      d.size = size(d.event) + 1
    })
    svg.append("g")
      .selectAll(".circ")
      .data(data)
      .enter()
      .append("circle") 
        .attr("class", "circ")
        .attr("stroke", "white")
        .attr("stroke-width", d => d.event.event_id === tempEventId ? 4 : 0)
        .attr("fill", d => d.event.event_id === tempEventId ? '#eddc6d' : d.color)
        .attr("opacity", d => d.event.event_id === tempEventId ? '1' : '0.9')
        .attr("r", d => size(d.event))
        .attr("cx", d => d.x)
        .attr("cy", d => d.y)
        .on('mouseenter', function(e, d) {
          e.preventDefault()
          if (d.event.event_id === tempEventId) {
            d3.select(this).raise()
          }
          if (!fixed) {
            d3.select(this).raise()
            hover(setTempEventId, fixed)(d.event)
          }
        })
        .on('click', (e, d) => {
          e.stopPropagation()
          toggleSelected(setFixed, setTempEventId, fixed)(d.event)
        })
  }

  React.useEffect(() => {
      const rootEl = d3.select(rootRef.current)
      rootEl.append(() => svg.node())
  }, [eventsSize, events, fixed, tempEventId])

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

const toggleSelected = (setFixed, setEventId, fixed) => (e) => {
  setEventId(e.event_id)
  setFixed(!fixed)
}

const hover = (setEventId) => d => {
  setEventId(d.event_id)
}

const weights = {
  podcast: 0.03,
  video: 0.03,
  major: 0.03,
  controversy: 0.03,
}

const radiuses = {
  podcast: [4.5, 18],
  video: [4.5, 18],
  major: 8,
  controversy: 8,
}

const fetchPage = (query, events, setEvents, setLoading, setEmpty, setEventsSize) => {
  setLoading(true)
  return axios.post(`/api/events`, {
    query: query ? Query.toESQuery(query) : {
      match_all: {}
    },
    size: 1000,
  }).then(response => {
    const allEvents = response.data.results.map(e => ({
      ...e.event,
      highlight: e.highlight,
    }))
    if (allEvents.length === 0) {
      setEmpty(true)
    } else {
      setEmpty(false)
    }
    setEvents(allEvents)
    setEventsSize(allEvents.length)
    setLoading(false)
  })
}

export default Chart;
