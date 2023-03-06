import React from 'react'
import { DateTime } from 'luxon'
import { useDispatch, useSelector } from 'react-redux'
import {
  EuiBadge,
  EuiBasicTable,
  EuiButton,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHorizontalRule,
  EuiImage,
  EuiListGroup,
  EuiPanel,
  EuiText,
  EuiTextColor,
  EuiTitle,
} from '@elastic/eui'
import { BsSpotify, BsYoutube } from 'react-icons/bs'
import axios from 'axios'
import { set as setEvent } from './data/eventsSlice'
import { add as addToast } from './data/toastsSlice'


const Info = ({ info, isEditing, setInfo }) => {    
  const [modifiedDoc, setModifiedDoc] = React.useState(info && {event_id: info.event_id, jsonStr: JSON.stringify(info, null, "    ")})
  const dispatch = useDispatch()
  const people = useSelector(state => state.people.value)

  React.useEffect(() => {
    if ((info && !modifiedDoc) || (info && info.event_id !== modifiedDoc.event_id)) {
      setModifiedDoc({
        event_id: info.event_id,
        jsonStr: JSON.stringify(info, null, "    ")
      })
    }
  }, [info, modifiedDoc])


  if (!info) {
    return null
  }

  const typeNames = {
    spotify: "Listen on Spotify",
    youtube: "Watch on YouTube",
  }

  const categoryLabel = {
    video: 'Video',
    podcast: 'Podcast'
  }

  const typeIcons = {
    spotify: <BsSpotify/>,
    youtube: <BsYoutube/>,
  }

  const links = info.links && info.links.map(l => ({
    label: typeNames[l.type],
    target: "_blank",
    href: l.url,
    icon: typeIcons[l.type],
  }))

  const roleLabel = {
    creator: 'Creator',
    host: 'Host',
    guest: 'Guest',
    topic: 'Discussed'
  }

  const columns = [
    {
      render: t => t.key
    },
    {
      render: t => t.value
    },
  ]

  const peopleColumns = [
    {
      render: pRef => {
        if (!people) {
          return null
        }
        const person = people.find(p => p.person_id === pRef.person_id)
        if (!person) {
          return null
        }
        return `${person.first_name} ${person.last_name}`
      }
    },
    {
      render: pRef => roleLabel[pRef.role]
    },
  ]

  const editingControlsDom = modifiedDoc && (<div>
    <pre>
      <textarea cols={120} rows={30} value={modifiedDoc.jsonStr} onChange={e => setModifiedDoc({event_id: modifiedDoc.event_id, jsonStr: e.target.value})} />
    </pre>
    <EuiButton onClick={() => onSaveDoc(dispatch, setInfo)(JSON.parse(modifiedDoc.jsonStr))}>Save</EuiButton>
  </div>)

  const infoDom = (<EuiFlexGroup>
    <EuiFlexItem grow={3}>
      <EuiPanel hasShadow={false}>
        <EuiFlexGroup alignItems="baseline">
          {info.thumb && (<EuiFlexItem grow={false}>
            <EuiImage alt="thumbnail" src={info.thumb} />  
          </EuiFlexItem>)}
          <EuiFlexItem grow={false}>
            <EuiTitle size="m">
              <h2>{info.name}</h2>
            </EuiTitle>
            {info.start_date && (<EuiText>
              <EuiTextColor color="subdued">{DateTime.fromMillis(info.start_date).toLocaleString(DateTime.DATE_HUGE)}</EuiTextColor>
            </EuiText>)}
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiBadge color="primary">
              {categoryLabel[info.category]}
            </EuiBadge>
          </EuiFlexItem>
        </EuiFlexGroup>
        <EuiHorizontalRule size="half" />
        <EuiText>
          <div dangerouslySetInnerHTML={{__html: info.description}}></div>
        </EuiText>
      </EuiPanel>
    </EuiFlexItem>
    {((links && links.length > 0) || (info.tags && info.tags.length > 0) || (info.people && info.people.length > 0)) && (<EuiFlexItem grow={1}>
      <br size="xl"/>
      <EuiFlexGroup direction="column">
        {info.people && info.people.length > 0 && (<EuiPanel grow={false}>
          <EuiText>
            <h4>People</h4>
          </EuiText>
          <EuiBasicTable items={info.people} columns={peopleColumns} />
        </EuiPanel>)}
        {links && links.length > 0 && (<EuiPanel grow={false}>
          <EuiText>
            <h4>Links</h4>
          </EuiText>
          <EuiHorizontalRule margin="s"/>
          <EuiListGroup listItems={links} color="primary" size="s" />
        </EuiPanel>)}
        {info.tags && info.tags.length > 0 && (<EuiPanel grow={false}>
          <EuiText>
            <h4>Tags</h4>
          </EuiText>
          <EuiBasicTable items={info.tags} columns={columns} />
        </EuiPanel>)}
      </EuiFlexGroup>
    </EuiFlexItem>)}
  </EuiFlexGroup>)

  return (<div>{infoDom}{isEditing && editingControlsDom}</div>)
}

const onSaveDoc = (dispatch, setInfo) => async (event) => {
  await axios.put(`/api/events/${event.event_id}`, event)
  dispatch(addToast({
    title: 'Saved',
    color: 'success',
  }))
  dispatch(setEvent(event))
  setInfo(event)
}

export default Info;