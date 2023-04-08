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
  const [filteredEvents, setFilteredEvents] = React.useState(null)

  const setInfo = (info) => {
    const existingParams = new URLSearchParams(window.location.search)
    if (existingParams.get('event_id') !== info.event_id) {
      existingParams.set('event_id', info.event_id)
      const newurl = `${window.location.protocol}//${window.location.host}${window.location.pathname}?${existingParams.toString()}`
      window.history.replaceState({path:newurl},'',newurl)
      setForce(force + 1)
    }
  }
  const setQuery = (query, searchTranscripts) => {
    const existingParams = new URLSearchParams(window.location.search)
    if (existingParams.get('search_transcripts') !== searchTranscripts) {
      if (!searchTranscripts) {
        existingParams.delete('search_transcripts')
      } else {
        existingParams.set('search_transcripts', searchTranscripts)
      }
      const newurl = `${window.location.protocol}//${window.location.host}${window.location.pathname}?${existingParams.toString()}`
      window.history.replaceState({path:newurl},'',newurl)
      setForce(force + 1)
    }
    if (query && existingParams.get('q') !== query.text) {
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
  const searchTranscripts = searchParams.get('search_transcripts') === 'true'

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
    <SearchBox setQuery={setQuery} query={query} searchTranscripts={searchTranscripts} setFilteredEvents={setFilteredEvents} />
    {!isMobile && <Chart events={filteredEvents || events} query={filteredEvents ? undefined : query} setInfo={setInfo} info={info} />}
    {isMobile && <EventList style={{marginTop: '-40px'}} events={filteredEvents || events} query={filteredEvents ? undefined : query} />}
    {!isMobile && <Info info={info} isEditing={isEditing} setInfo={setInfo} />}
  </div>)
}

const EventList = ({
  query,
  events: unfilteredEvents,
  style,
}) => {
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
      render: (a, e) => (<EuiText size="xs">
        <EuiTextColor color="subdued">{DateTime.fromMillis(e.start_date).toLocaleString(DateTime.DATE_SHORT)}</EuiTextColor>
      </EuiText>),
      width: '100px',
      sortable: true,
      mobileOptions: {
        header: false,
        width: '100%',
        truncateText: false,
        render: e => (<EuiText size="xs">
          <EuiTextColor color="subdued">{DateTime.fromMillis(e.start_date).toLocaleString(DateTime.DATE_SHORT)}</EuiTextColor>
        </EuiText>),
      },
    },
    {
      name: 'Name',
      render: e => <EuiText size="xs"><Link to={`/events/${e.event_id}`}>{e.name}</Link></EuiText>,
      mobileOptions: {
        header: false,
        width: '100%',
        truncateText: false,
        render: e => {
          const highlights = e.highlight && [
            ...(e.highlight.description || []),
            ...(e.highlight['transcription.text'] || [])
          ]
          return <EuiFlexGroup gutterSize="xs">
            <EuiFlexItem>
              <EuiText size="s">
                {e.highlight && e.highlight.name && e.highlight.name.length > 0 ? <Link className="highlight" to={`/events/${e.event_id}?highlight=`} dangerouslySetInnerHTML={{__html: e.highlight.name[0]}} /> : <Link to={`/events/${e.event_id}`}>{e.name}</Link>}
              </EuiText>
            </EuiFlexItem>
            {highlights && (<EuiFlexItem className="highlight">
              {highlights.map(h => {
                return <EuiText size="xs" color="subdued" dangerouslySetInnerHTML={{ __html: h }}/>
              })}
            </EuiFlexItem>)}
          </EuiFlexGroup>
        },
      },
    }
  ]

  const onChange = ({sort}) => {
    setSort(sort)
  }

  return (<EuiBasicTable
    responsive
    style={style}
    sorting={{
      sort: sort,
    }}
    columns={eventsColumns}
    items={sortedEvents}
    onChange={onChange}
    rowProps={{
      style: {
        padding: '0px',
      }
    }}
  />)
}

export default Timeline