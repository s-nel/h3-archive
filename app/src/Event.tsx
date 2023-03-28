import { EuiBreadcrumb, EuiBreadcrumbs, EuiPageHeader, EuiSpacer } from '@elastic/eui'
import React from 'react'
import { useSelector } from 'react-redux'
import { useNavigate, useParams } from 'react-router-dom'
import Info from './Info'

const Event = () => {
  const eventId = useParams().eventId
  const events = useSelector(state => state.events.value)
  const event = events && eventId && events.find(e => e.event_id === eventId)
  const navigate = useNavigate()

  const breadcrumbs: EuiBreadcrumb[] = [
    {
      text: 'Timeline',
      onClick: () => {
        navigate('/')
      }
    },
    {
      text: event && event.name.substring(0, 15),
    },
  ]

  if (!event) {
    return null
  }

  return (<div>
    <EuiBreadcrumbs breadcrumbs={breadcrumbs} responsive={false} />
    <Info info={event} isEditing={false} />
  </div>)
}

export default Event