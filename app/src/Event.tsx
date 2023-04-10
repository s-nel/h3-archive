import { EuiBreadcrumb, EuiBreadcrumbs, EuiIcon, EuiPageHeader, EuiSpacer } from '@elastic/eui'
import React from 'react'
import { useSelector } from 'react-redux'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import Info from './Info'

const Event = () => {
  const eventId = useParams().eventId
  const events = useSelector(state => state.events.value)
  const event = events && eventId && events.find(e => e.event_id === eventId)
  const navigate = useNavigate()

  const breadcrumbs: EuiBreadcrumb[] = [
    {
      text: (
        <div>
          <EuiIcon size="s" type="arrowLeft" /> Return
        </div>
      ),
      onClick: () => {
        navigate(-1)
      }
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