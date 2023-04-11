import React from 'react'
import { height as chartHeight } from './Chart'
import { DateTime } from 'luxon'
import Chart from './Chart'
import Info, {categoryColor, categoryLabel} from './Info'
import './App.css'
import SearchBox from './SearchBox'
import { useSelector } from 'react-redux'
import {
  EuiBadge,
  EuiBasicTable,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLoadingChart,
  EuiPanel,
  EuiSkeletonText,
  EuiSpacer,
  EuiTableSortMobile,
  EuiText,
  EuiTextColor,
  Query,
  useIsWithinBreakpoints,
} from '@elastic/eui'
import { Link } from 'react-router-dom'
import { VariableSizeList as List } from 'react-window'
//import { CellMeasurer, CellMeasurerCache, List } from 'react-virtualized'
import AutoSizer from 'react-virtualized-auto-sizer'
import InfiniteLoader from 'react-window-infinite-loader'
import axios from 'axios'

const BATCH_SIZE = 50

const Timeline = ({
  isEditing,
}) => {
  const [force, setForce] = React.useState(0)
  const isMobile = useIsWithinBreakpoints(['xs', 's'])
  const [filteredEvents, setFilteredEvents] = React.useState(null)
  const [isLoading, setLoading] = React.useState(false)

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
  const setSort = (field, direction) => {
    console.log('set-sort', sort)
    const existingParams = new URLSearchParams(window.location.search)
    existingParams.set('sort', `${field}:${direction}`)
    const newurl = `${window.location.protocol}//${window.location.host}${window.location.pathname}?${existingParams.toString()}`
    window.history.replaceState({path:newurl},'',newurl)
    setForce(force + 1)
  }
  const searchParams = new URLSearchParams(window.location.search)
  const query = searchParams.get('q') && Query.parse(searchParams.get('q'))
  const sortParts = searchParams.get('sort')?.split(':')
  const sort = sortParts && sortParts.length === 2 && {
    field: sortParts[0],
    direction: sortParts[1]
  }
  const [events, setEvents] = React.useState([])

  const info = events && searchParams.get('event_id') && events.find(e => e.event_id === searchParams.get('event_id'))

  if (!events && !isMobile) {
    return (<EuiFlexGroup
      style={{
        maxWidth: '100%',
        height: `${chartHeight}px`,
      }}
      alignItems="center"
      justifyContent="center"
    >
      <EuiFlexItem grow={false}>
        <EuiLoadingChart size="xl" />
      </EuiFlexItem>
    </EuiFlexGroup>)
  }

  return (<EuiFlexItem grow>
    <EuiFlexGroup direction="column" responsive={false} gutterSize={isMobile ? 's' : undefined}>
      <EuiFlexItem grow={false}>
        <SearchBox isLoading={isLoading} setLoading={setLoading} setQuery={setQuery} query={query} setFilteredEvents={setFilteredEvents} />
      </EuiFlexItem>
      {isMobile && (<EuiFlexItem grow={false}><EuiTableSortMobile items={[
        {
          name: 'Date',
          key: 'start_date',
          onSort: () => setSort('start_date', sort && sort.field === 'start_date' && sort.direction === 'asc' ? 'desc' : 'asc'),
          isSorted: sort && sort.field === 'start_date',
          isSortAscending: sort && sort.direction === 'asc'
        },
        {
          name: 'Score',
          key: '_score',
          onSort: () => setSort('_score', sort && sort.field === '_score' && sort.direction === 'desc' ? 'asc' : 'desc'),
          isSorted: sort && sort.field === '_score',
          isSortAscending: sort && sort.direction === 'asc'
        }
      ]} /></EuiFlexItem>)}
      {!isMobile && <EuiFlexItem grow={false}><Chart events={filteredEvents || events} query={filteredEvents ? undefined : query} setInfo={setInfo} info={info} /></EuiFlexItem>}
      {isMobile && <EuiFlexItem><EventList sort={sort} events={events} setEvents={setEvents} isLoading={isLoading} setLoading={setLoading} query={query} /></EuiFlexItem>}
      {!isMobile && <EuiFlexItem grow><Info info={info} isEditing={isEditing} setInfo={setInfo} /></EuiFlexItem>}
    </EuiFlexGroup>
  </EuiFlexItem>)
}

const EventList = ({
  query,
  sort,
  events,
  setEvents,
  isLoading,
  setLoading
}) => {
  const [totalEvents, setTotalEvents] = React.useState(null)
  const listRef = React.useRef({})
  const rowHeights = React.useRef({})
  const [isEmpty, setEmpty] = React.useState(false)

  React.useEffect(() => {
    if (!isEmpty && events.length === 0) {
      fetchPage(query, events, setEvents, setTotalEvents, setLoading, setEmpty, 0, BATCH_SIZE, sort)
    }
  }, [isEmpty, events])
  React.useEffect(() => {
    setEvents([])
    setTotalEvents(null)
    setEmpty(false)
  }, [query && query.text, sort && sort.field, sort && sort.direction])

  const getRowHeight = (index) => {
    return rowHeights.current[index] + GUTTER_SIZE || 80
  }

  const setRowHeight = (index, size) => {
    listRef.current.resetAfterIndex(0);
    rowHeights.current = { ...rowHeights.current, [index]: size };
  }

  const loadMoreItems = (startIndex, stopIndex) => {
    const pageIndex = startIndex / BATCH_SIZE
    fetchPage(query, events, setEvents, setTotalEvents, setLoading, setEmpty, pageIndex, BATCH_SIZE, sort)
  }

  const EventRow = ({
    style,
    index,
    parent,
  }) => {
    const rowRef = React.useRef({})
  
    React.useEffect(() => {
      if (rowRef.current) {
        setRowHeight(index, rowRef.current.clientHeight)
      }
    }, [rowRef && rowRef.current])
  
    if (index >= events.length) {
      return null
    }

    const e = events[index]
  
    const highlights = e.highlight && [
      ...(e.highlight.description || []),
      ...(e.highlight['transcription.text'] || [])
    ]
  
    return (<div 
      style={{
        ...style,
        top: style.top + GUTTER_SIZE,
        height: style.height - GUTTER_SIZE,
      }}
    >
      <EuiPanel panelRef={rowRef}>
        <EuiFlexGroup responsive={false} direction="column" gutterSize="s">
          <EuiFlexItem grow={false}>
            <EuiFlexGroup responsive={false} alignItems="center">
              <EuiFlexItem grow>
                <EuiText size="xs">
                  <EuiTextColor color="subdued">{DateTime.fromMillis(e.start_date).toLocaleString(DateTime.DATE_SHORT)}</EuiTextColor>
                </EuiText>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiBadge color="default">{categoryLabel[e.category]}</EuiBadge>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiText size="s">
              {e.highlight && e.highlight.name && e.highlight.name.length > 0 ? <Link className="highlight" to={`/events/${e.event_id}`} state={{ highlights: e.highlight }} dangerouslySetInnerHTML={{__html: e.highlight.name[0]}} /> : <Link to={`/events/${e.event_id}`} state={{ highlights: e.highlight }}>{e.name}</Link>}
            </EuiText>
          </EuiFlexItem>
          {highlights && highlights.length > 0 && (<EuiFlexItem className="highlight">
            {highlights.map(h => {
              return <EuiText size="xs" color="subdued" dangerouslySetInnerHTML={{ __html: h }}/>
            })}
          </EuiFlexItem>)}
        </EuiFlexGroup>
      </EuiPanel>
    </div>)
  }

  return (<EuiFlexItem grow style={{width: '100vw', marginLeft: '-8px', marginRight: '-8px'}}>
    <AutoSizer>
      {({ height, width }) => (<InfiniteLoader
        isItemLoaded={i => isEmpty || i < events.length}
        loadMoreItems={isLoading || isEmpty ? () => {} : loadMoreItems}
        itemCount={totalEvents}
      >
        {({ onItemsRendered, ref }) => (
          <List
            ref={el => {
              listRef.current = el
              ref.current = el
            }}
            itemCount={totalEvents}
            onItemsRendered={onItemsRendered}
            width={width}
            height={height}
            itemSize={getRowHeight}
          >
            {EventRow}
          </List>
        )}
      </InfiniteLoader>)}
    </AutoSizer>
  </EuiFlexItem>)
}

const GUTTER_SIZE = 5

const fetchPage = (query, events, setEvents, setTotalEvents, setLoading, setEmpty, index, batchSize, sort) => {

  const nestedFields = [
    "person",
    "date"
  ]

  const searchWithoutNestedFields = query && nestedFields.reduce((acc, nestedField) => acc.removeSimpleFieldClauses(nestedField).removeOrFieldClauses(nestedField), query)
  setLoading(true)
  return axios.post(`/api/events`, {
    query: query ? Query.toESQuery(query) : {
      match_all: {}
    },
    size: batchSize,
    from: batchSize * index,
    sort: (sort && {
      [sort.field]: sort.direction
    }) || (query && query.text ? undefined : {
      start_date: 'desc'
    }),
  }).then(response => {
    const allEvents = [
      ...events,
      ...response.data.results.map(e => ({
        ...e.event,
        highlight: e.highlight,
      }))
    ]
    if (allEvents.length === 0) {
      setEmpty(true)
    } else {
      setEmpty(false)
    }
    setEvents(allEvents)
    setTotalEvents(response.data.total)
    setLoading(false)
  })
}

export default Timeline