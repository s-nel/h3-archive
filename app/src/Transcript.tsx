import React from 'react'
import axios from 'axios'
import { EuiCodeBlock, EuiLink, EuiSkeletonText, EuiText, EuiTextColor, useIsWithinBreakpoints } from '@elastic/eui'
import { useLocation } from 'react-router-dom'
import parse from 'html-react-parser'

const Transcript = ({
  eventId,
  ytVideo,
}) => {
  const [event, setEvent] = React.useState(null)
  const [isFetching, setFetching] = React.useState(false)
  const isMobile = useIsWithinBreakpoints(['xs', 's'])
  const [currentPlaybackTime, setCurrentPlaybackTime] = React.useState(0)

  React.useEffect(() => {
    if (!isFetching && (!event || event.event_id !== eventId)) {
      fetchTranscript(eventId, setEvent, setFetching)
      setFetching(true)
    }
  }, [isFetching, setFetching, event, eventId, setEvent])

  React.useEffect(() => {
    const interval = setInterval(() => {
      if (ytVideo) {
        setCurrentPlaybackTime(Math.ceil(ytVideo.getCurrentTime()))
      }
    }, 500);
    return () => {
      clearInterval(interval);
    };
  }, [])

  if (isFetching || !event || !event.transcription || event.event_id !== eventId) {
    return <EuiSkeletonText />
  }

  if (!event.transcription.segments) {
    return <EuiText color="subdued">Transcript not found</EuiText>
  }

  let lastSegment = null
  const ytLink = event.links.find(l => l.type === 'youtube')

  console.log("currentPlaybackTime", currentPlaybackTime)

  return (<EuiCodeBlock paddingSize={isMobile ? 's' : undefined} overflowHeight={isMobile ? 300 : 400}>
    {event.transcription.segments.map((segment, i) => {
      const ytLinkWithTs = ytLink && ytLink.url && `${ytLink.url}?t=${segment.start}s`
      
      const segmentText = i === 0 || (lastSegment && lastSegment.end != segment.start && segment.start - lastSegment.end > 2) ? segment.text.trim() : segment.text

      const isUnplayed = ytVideo && (ytVideo.getPlayerState() === -1 || ytVideo.getPlayerState() === 5)
      const isPlaying = !isUnplayed && currentPlaybackTime >= segment.start && currentPlaybackTime < segment.end

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
      >
        {segmentText}
      </EuiLink>) : (<span key={segment.id}>{segment.text}</span>)

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

const fetchTranscript = async (eventId, setEvent, setFetching) => {
  const event = await axios.get(`/api/events/${eventId}?with_transcript=true`)
  setEvent(event.data)
  setFetching(false)
}

export default Transcript
