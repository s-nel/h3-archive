import React from 'react'
import axios from 'axios'
import { EuiAvatar, EuiCodeBlock, EuiFlexGroup, EuiFlexItem, EuiIcon, EuiImage, EuiLink, EuiPanel, EuiSkeletonText, EuiText, EuiTextColor, useIsWithinBreakpoints } from '@elastic/eui'
import { useSelector } from 'react-redux'
import AutoSizer from 'react-virtualized-auto-sizer'
import { VariableSizeList as List } from 'react-window'
import Avatar from './Avatar'

const GUTTER_SIZE = 7

const Transcript = ({
  transcript,
  event,
  ytVideo,
  ytVideoRef,
  highlightTerms,
  plain,
}) => {
  const isMobile = useIsWithinBreakpoints(['xs', 's'])
  const people = useSelector(state => state.people.value)
  const firstMatchRef = React.useRef(null)
  const listRef = React.createRef()
  const rowHeights = React.useRef({})

  React.useEffect(() => {
    if (firstMatchRef.current && ytVideoRef && ytVideoRef.current) {
      firstMatchRef.current.scrollIntoView()
      ytVideoRef.current.scrollIntoView()
    }
  }, [firstMatchRef && firstMatchRef.current, ytVideoRef && ytVideoRef.current])

  if (!transcript.transcription.segments) {
    return <EuiText color="subdued">Transcript not found</EuiText>
  }

  let lastSegment = null
  let firstMatch = null
  const ytLink = event.links.find(l => l.type === 'youtube')

  if (plain) {
    return (<EuiText>{transcript.transcription.text}</EuiText>)
  }

  const splits = transcript.transcription.segments.reduce((acc, segment) => {
    const isGt5SecBreak = lastSegment && segment.start - lastSegment.end > 5
    const isGt2SecBreak = lastSegment && segment.start - lastSegment.end > 2
    const isSpeakerChange = (lastSegment && lastSegment.speaker !== segment.speaker) || !lastSegment

    const ytLinkWithTs = ytLink && ytLink.url && `${ytLink.url}?t=${segment.start}s`

    const segmentText = segment.text.trim()

    const highlightedSegmentText = highlightTerms ? Object.keys(highlightTerms).reduce((acc, ht) => {
      if (!firstMatch && acc.includes(ht)) {
        firstMatch = segment.id
      }
      const re = new RegExp(ht, 'gi')
      return acc.replace(re, `<mark>${ht}</mark>`)
    }, segmentText) : segmentText

    const dom = ytLink && ytLink.url ? (<EuiLink 
      style={{
        fontStyle: segment.is_soundbite ? 'italic' : undefined,
        fontFamily: "'Roboto Mono',Menlo,Courier,monospace",
        fontSize: '12px',
      }}
      key={segment.id}
      external={false} 
      color={segment.is_soundbite ? 'subdued' : 'text'}
      target="_blank" 
      href={ytLinkWithTs}
      onClick={ytVideo ? e => {
        e.preventDefault()
        ytVideo.seekTo(segment.start, true)
        ytVideo.playVideo()
      }: undefined}
    ><span ref={firstMatch && firstMatch === segment.id ? firstMatchRef : undefined} dangerouslySetInnerHTML={{__html: highlightedSegmentText}}></span></EuiLink>) : (<span key={segment.id}>{highlightedSegmentText}</span>)

    lastSegment = segment

    if (isSpeakerChange || isGt5SecBreak || lastSegment === null) {
      acc.push({
        speaker: segment.speaker,
        dom: [dom],
      })
      return acc
    } else {
      const last = acc[acc.length - 1]
      last.dom.push(<span> </span>)
      last.dom.push(dom)
      return acc
    }
  }, [])

  const getRowHeight = (index) => {
    return rowHeights.current[index] + GUTTER_SIZE || 24
  }

  const setRowHeight = (index, size) => {
    listRef.current.resetAfterIndex(0)
    rowHeights.current = { ...rowHeights.current, [index]: size }
  }

  const Segment = ({
    data: {
      segments,
      people,
    },
    index,
    style,
  }) => {
    const rowRef = React.useRef({})
    const segment = segments[index]
    const speaker = segment.speaker && people && people.find(p => p.person_id === segment.speaker)
  
    React.useEffect(() => {
      if (rowRef.current) {
        setRowHeight(index, rowRef.current.clientHeight)
      }
    }, [rowRef && rowRef.current]) 
  
    return (<div
      style={{
        ...style,
        top: style.top + GUTTER_SIZE,
        height: style.height - GUTTER_SIZE,
      }} 
    >
      <EuiFlexGroup 
        ref={el => rowRef.current = el} 
        responsive={false} 
        alignItems="baseline" 
        gutterSize="s"
      >
        {speaker && (<EuiFlexItem grow={false}>
          <Avatar person={speaker} size="s" />
        </EuiFlexItem>)}
        <EuiFlexItem grow>
          <span>
            {segment.dom}
          </span>
        </EuiFlexItem>
      </EuiFlexGroup>
    </div>)
  }

  return (<EuiPanel 
    className="transcript" 
    color="transparent"
    style={{
      height: isMobile ? '300px' : '400px' 
    }} 
    paddingSize={isMobile ? 's' : 'l'}
  >
    <AutoSizer>
      {({ height, width }) => (<List
        className="eui-yScroll"
        style={{
          background: 'none',
        }}
        ref={listRef}
        itemCount={splits.length}
        width={width}
        height={height}
        itemData={{
          segments: splits,
          people: people,
        }}
        itemSize={getRowHeight}
      >
        {Segment}
      </List>)}
    </AutoSizer>
  </EuiPanel>)
}

export default Transcript
