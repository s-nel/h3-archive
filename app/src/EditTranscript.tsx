import axios from 'axios'
import React from 'react'
import { useSelector } from 'react-redux'
import { useParams } from 'react-router-dom'
import TranscriptEditor from './TranscriptEditor'

const EditTranscript = () => {
  const params = useParams()
  const eventId = params && params.eventId
  const [segments, setSegments] = React.useState()
  const [event, setEvent] = React.useState()
  const rawPeople = useSelector(state => state.people.value)
  const [eventCounts, setEventCounts] = React.useState()
  const withEventCounts = eventCounts && rawPeople && rawPeople.map(person => {
    const eventCount = eventCounts.pplcount.pplcount2.buckets.find(k => k.key === person.person_id)
    return {
      ...person,
      event_count: (eventCount && eventCount.doc_count) || 0,
    }
  })
  const people = withEventCounts && withEventCounts.sort((a, b) => {
    const diff = b.event_count - a.event_count
    if (diff !== 0) {
      return diff
    }
    const aName = a.display_name || `${a.first_name} ${a.last_name}`
    const bName = b.display_name || `${b.first_name} ${b.last_name}`
    return aName.localeCompare(bName)
  }) || []

  React.useEffect(() => {
    getTranscript(eventId, setSegments)
    getEvent(eventId, setEvent)
    getEventCounts(setEventCounts)
  }, [eventId])

  const ytLink = event && event.links.find(l => l.type === 'youtube')
  const [ytPlayer, setYtPlayer] = React.useState(null)

  var regExp = /^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/
  const match = ytLink && ytLink.url && ytLink.url.match(regExp)
  const ytId = match && match[2].length === 11 && match[2]

  if (!eventId || !event || !segments) {
    return null
  }

  return (<TranscriptEditor 
    ytId={ytId}
    segments={segments}
    speakers={people.map(p => ({
      id: p.person_id,
      displayName: p.display_name || `${p.first_name} ${p.last_name}`,
      thumb: p.thumb,
    }))}
    onSave={(segments) => {
      setSegments(segments)
      saveTranscript(eventId, {segments,})()
    }}
    onSegmentsChanged={setSegments}
  />)
}

const getEvent = async (eventId, setEvent) => {
  const event = await axios.get(`/api/local/events/${eventId}`)
  setEvent(event.data)
}

const getTranscript = async (eventId, setSegments) => {
  const response = await axios.get(`/api/local/events/${eventId}`)
  setSegments(response.data.transcription.segments)
}

const getEventCounts = async setEventCounts => {
  const response = await axios.get('/api/events/counts')
  setEventCounts(response.data)
}

const saveTranscript = (eventId, transcript) => async () => {
  await axios.put(`/api/local/events/${eventId}/transcript`, transcript)
}

export default EditTranscript