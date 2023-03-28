import React from 'react'
import { height as chartHeight } from './Chart'
import { DateTime } from 'luxon'
import Chart from './Chart'
import Info from './Info'
import './App.css'
import SearchBox from './SearchBox'
import { useSelector } from 'react-redux'
import {
  EuiBasicTable,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLoadingChart,
  EuiSkeletonText,
  EuiSpacer,
  EuiText,
  EuiTextColor,
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
  const [sort, setSort] = React.useState({
    field: 'date',
    direction: 'desc'
  })

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
  const sortedEvents = filteredEvents && [...filteredEvents].sort((a, b) => {
    if (sort.field === 'date') {
      if (sort.direction === 'asc') {
        return a.start_date - b.start_date
      }
      return b.start_date - a.start_date
    } else {
      return 0
    }
  })

  const eventsColumns = [
    {
      name: 'Date',
      field: 'date',
      render: (a, e) => (<EuiText>
        <EuiTextColor color="subdued">{DateTime.fromMillis(e.start_date).toLocaleString(DateTime.DATE_SHORT)}</EuiTextColor>
      </EuiText>),
      width: '120px',
      sortable: true,
    },
    {
      name: 'Name',
      render: e => <Link to={`/events/${e.event_id}`}>{e.name}</Link>
    }
  ]

  const onChange = ({sort}) => {
    console.log(sort)
    setSort(sort)
  }

  return (<EuiBasicTable
    responsive={false}
    sorting={{
      sort: sort,
    }}
    columns={eventsColumns}
    items={sortedEvents}
    onChange={onChange}
  />)
}

export default Timeline