import React from 'react'
import { height as chartHeight } from './Chart'
import Chart from './Chart'
import Info from './Info'
import './App.css'
import SearchBox from './SearchBox'
import { useSelector } from 'react-redux'
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiLoadingChart,
  EuiSkeletonText,
  EuiSpacer,
  Query,
  useIsWithinBreakpoints,
} from '@elastic/eui'
import { Link } from 'react-router-dom'

const Timeline = ({
  isEditing,
}) => {
  const [force, setForce] = React.useState(0)
  const events = useSelector(state => state.events.value)
  const isMobile = useIsWithinBreakpoints(['xs', 's'])

  const setInfo = (info) => {
    const existingParams = new URLSearchParams(window.location.search)
    if (existingParams.get('event_id') !== info.event_id) {
      existingParams.set('event_id', info.event_id)
      const newurl = `${window.location.protocol}//${window.location.host}${window.location.pathname}?${existingParams.toString()}`
      window.history.replaceState({path:newurl},'',newurl)
      setForce(force + 1)
    }
  }
  const setQuery = (query) => {
    const existingParams = new URLSearchParams(window.location.search)
    if (existingParams.get('q') !== query.text) {
      if (!query.text || query.text === '') {
        existingParams.delete('q')
      } else {
        existingParams.set('q', query.text)
      }
      const newurl = `${window.location.protocol}//${window.location.host}${window.location.pathname}?${existingParams.toString()}`
      window.history.replaceState({path:newurl},'',newurl)
      setForce(force + 1)
    }
  }
  const searchParams = new URLSearchParams(window.location.search)
  const query = searchParams.get('q') && Query.parse(searchParams.get('q'))

  const info = events && searchParams.get('event_id') && events.find(e => e.event_id === searchParams.get('event_id'))

  if (!events) {
    return (<EuiFlexGroup
      style={{
        maxWidth: '100%',
        height: `${chartHeight}px`,
      }}
      alignItems="center"
      justifyContent="center"
    >
      <EuiFlexItem grow={false}>
        {!isMobile && <EuiLoadingChart size="xl" />}
        {isMobile && <EuiSkeletonText />}
      </EuiFlexItem>
    </EuiFlexGroup>)
  }

  return (<div>
    <SearchBox setQuery={setQuery} query={query} />
    {!isMobile && <Chart query={query} setInfo={setInfo} info={info} />}
    {isMobile && <EventList query={query} />}
    <Info info={info} isEditing={isEditing} setInfo={setInfo} />
  </div>)
}

const EventList = ({
  query,
}) => {
  const unfilteredEvents = useSelector(state => state.events.value)

  let filteredEvents
  if (query) {
    filteredEvents = Query.execute(query, unfilteredEvents.map(e => ({
      ...e,
      person: e.people.map(p => p.person_id),
      date: e.start_date,
    })))
  } else {
    filteredEvents = unfilteredEvents
  }
  console.log("filteredEvents", filteredEvents)
  const sortedEvents = filteredEvents && [...filteredEvents].sort((a, b) => {
    return a.start_date - b.start_date
  })

  return (<EuiFlexGroup direction="column">
    <EuiFlexItem grow={false}>
      <EuiSpacer size="m"/>
    </EuiFlexItem>
    {sortedEvents.map(e => (<EuiFlexItem key={e.event_id} grow={false}>
      <Link to={`/events/${e.event_id}`}>{e.name}</Link>
    </EuiFlexItem>))}
  </EuiFlexGroup>)
}

export default Timeline