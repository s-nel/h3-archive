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

const GUTTER_SIZE = 5

const DesktopEventList = ({
  sort,
  events,
  setEventId,
  eventId,
  isLoading,
}) => {
  const listRef = React.createRef()
  const rowHeights = React.useRef({})

  React.useEffect(() => {
    if (listRef.current) {
      const index = events && events.findIndex(e => e.event_id === eventId)
      if (index) {
        listRef.current.scrollToItem(index, 'center')
      }
    }
  }, [eventId])

  if (!events || isLoading) {
    return <EuiSkeletonText lines={10} />
  }

  const getRowHeight = (index) => {
    return rowHeights.current[index] + GUTTER_SIZE || 80
  }

  const setRowHeight = (index, size) => {
    listRef.current.resetAfterIndex(0);
    rowHeights.current = { ...rowHeights.current, [index]: size };
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
      <EuiPanel 
        onClick={() => {
          setEventId(e.event_id, e.highlight)
        }} 
        panelRef={rowRef} 
        style={{ borderColor: e.event_id === eventId ? '#61dafb' : undefined}} 
        hasBorder 
        color="plain"
      >
        <EuiFlexGroup responsive={false} direction="column" gutterSize="s">
          <EuiFlexItem grow={false}>
            <EuiFlexGroup responsive={false} alignItems="center">
              <EuiFlexItem grow>
                <EuiText size="xs">
                  <EuiTextColor color="subdued">{DateTime.fromMillis(e.start_date, { zone: 'utc' }).toLocaleString(DateTime.DATE_SHORT)}</EuiTextColor>
                </EuiText>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiBadge color="default">{categoryLabel[e.category]}</EuiBadge>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiText size="s">
              {e.highlight && e.highlight.name && e.highlight.name.length > 0 ? <span className="highlight" dangerouslySetInnerHTML={{__html: e.highlight.name[0]}} /> : <span>{e.name}</span>}
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

  return (<div style={{height: `${window.innerHeight - 48 - 24 - 56 - 24}px`}}>
    <AutoSizer>
      {({ height, width }) => (<List
        className="eui-yScroll"
        style={{
          background: 'none',
        }}
        ref={listRef}
        itemCount={events.length}
        width={width}
        height={height}
        itemSize={getRowHeight}
      >
        {EventRow}
      </List>)}
    </AutoSizer>
  </div>)
}

export default DesktopEventList