import { EuiBreadcrumb, EuiBreadcrumbs, EuiIcon, EuiPageHeader, EuiSpacer } from '@elastic/eui'
import axios from 'axios'
import React from 'react'
import { useSelector } from 'react-redux'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import Info from './Info'

const Event = () => {
  const eventId = useParams().eventId
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

  return (<div>
    <EuiBreadcrumbs breadcrumbs={breadcrumbs} responsive={false} />
    <Info eventId={eventId} isEditing={false} />
  </div>)
}

export default Event