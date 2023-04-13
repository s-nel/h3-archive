import React from 'react'
import axios from 'axios'
import { EuiCodeBlock, EuiLink, EuiSkeletonText, EuiText, EuiTextColor, useIsWithinBreakpoints } from '@elastic/eui'

const Transcript = ({
  event,
  ytVideo,
  ytVideoRef,
  highlightTerms,
}) => {
  const isMobile = useIsWithinBreakpoints(['xs', 's'])
  const firstMatchRef = React.useRef(null)

  React.useEffect(() => {
    if (firstMatchRef.current && ytVideoRef && ytVideoRef.current) {
      firstMatchRef.current.scrollIntoView()
      ytVideoRef.current.scrollIntoView()
    }
  }, [firstMatchRef && firstMatchRef.current, ytVideoRef && ytVideoRef.current])

  if (!event.transcription.segments) {
    return <EuiText color="subdued">Transcript not found</EuiText>
  }

  //console.log('hit8', event, ytVideo, ytVideoRef, highlightTerms)

  let lastSegment = null
  let firstMatch = null
  const ytLink = event.links.find(l => l.type === 'youtube')

  return (<EuiCodeBlock className="transcript" paddingSize={isMobile ? 's' : undefined} overflowHeight={isMobile ? 300 : 400}>
    {event.transcription.segments.map((segment, i) => {
      const ytLinkWithTs = ytLink && ytLink.url && `${ytLink.url}?t=${segment.start}s`
      
      const segmentText = i === 0 || (lastSegment && lastSegment.end != segment.start && segment.start - lastSegment.end > 2) ? segment.text.trim() : segment.text

      const isPlaying = false

      const highlightedSegmentText = highlightTerms ? Object.keys(highlightTerms).reduce((acc, ht) => {
        if (!firstMatch && acc.includes(ht)) {
          firstMatch = segment.id
        }
        const re = new RegExp(ht, 'gi')
        return acc.replace(re, `<mark>${ht}</mark>`)
      }, segmentText) : segmentText

      const segmentDom = ytLink && ytLink.url ? (<EuiLink 
        key={segment.id}
        external={false} 
        color={isPlaying ? undefined : 'text'}
        style={{color: isPlaying ? "#ffff00": undefined}}
        target="_blank" 
        href={ytLinkWithTs}
        onClick={ytVideo ? e => {
          e.preventDefault()
          ytVideo.seekTo(segment.start, true)
          ytVideo.playVideo()
        }: undefined}
      ><span ref={firstMatch && firstMatch === segment.id ? firstMatchRef : undefined} dangerouslySetInnerHTML={{__html: highlightedSegmentText}}></span></EuiLink>) : (<span key={segment.id}>{highlightedSegmentText}</span>)

      if (lastSegment && lastSegment.end != segment.start && segment.start - lastSegment.end > 2) {
        const breaks = segment.start - lastSegment.end > 5 ? [
          <br key={`${segment.id}-br`} />,
          <br key={`${segment.id}-br2`} />
        ] : [ <br key={`${segment.id}-br`} /> ]

        lastSegment = segment
        return [
          ...breaks,
          segmentDom
        ]
      }
      lastSegment = segment
      return segmentDom
    })}
  </EuiCodeBlock>)
}

export default Transcript
