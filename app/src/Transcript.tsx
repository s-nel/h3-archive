import React from 'react'
import axios from 'axios'
import { EuiCodeBlock, EuiLink, EuiSkeletonText, EuiText } from '@elastic/eui'

const Transcript = ({
  eventId
}) => {
  const [event, setEvent] = React.useState(null)
  const [isFetching, setFetching] = React.useState(false)

  React.useEffect(() => {
    if (!isFetching && (!event || event.event_id !== eventId)) {
      fetchTranscript(eventId, setEvent)
      setFetching(true)
    }
  }, [isFetching, setFetching, event, eventId, setEvent])

  console.log(event)

  if (!isFetching || !event || !event.transcription) {
    return <EuiSkeletonText />
  }

  if (!event.transcription.segments) {
    return <EuiText color="subdued">Transcript not found</EuiText>
  }

  let lastSegment = null
  const ytLink = event.links.find(l => l.type === 'youtube')

  return (<EuiCodeBlock overflowHeight={400}>
    {event.transcription.segments.map((segment, i) => {
      const ytLinkWithTs = ytLink && ytLink.url && `${ytLink.url}?t=${segment.start}s`
      
      const segmentText = i === 0 || (lastSegment && lastSegment.end != segment.start) ? segment.text.trim() : segment.text

      const segmentDom = ytLink && ytLink.url ? (<EuiLink external={false} color="text" key={segment.id} target="_blank" href={ytLinkWithTs}>{segmentText}</EuiLink>) : (<span key={segment.id}>{segment.text}</span>)

      console.log(lastSegment && lastSegment.end, segment.start)

      if (lastSegment && lastSegment.end != segment.start && segment.start - lastSegment.end > 2) {
        const breaks = segment.start - lastSegment.end > 10 ? [
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

const fetchTranscript = async (eventId, setEvent) => {
  const event = await axios.get(`/api/events/${eventId}?with_transcript=true`)
  setEvent(event.data)
}

export default Transcript
