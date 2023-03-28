import React from 'react'
import { DateTime } from 'luxon'
import { useDispatch, useSelector } from 'react-redux'
import { Link } from 'react-router-dom'
import {
  EuiBadge,
  EuiBasicTable,
  EuiButton,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHorizontalRule,
  EuiIcon,
  EuiImage,
  EuiListGroup,
  EuiPanel,
  EuiText,
  EuiTextColor,
  EuiTitle,
} from '@elastic/eui'
import { BsSpotify, BsYoutube, BsPerson } from 'react-icons/bs'
import axios from 'axios'
import { set as setEvent } from './data/eventsSlice'
import { add as addToast } from './data/toastsSlice'

export const roleLabel = {
  creator: 'Creator',
  host: 'Host',
  guest: 'Guest',
  topic: 'Discussed',
  subject: 'Subject',
  crew: 'Crew',
}

export const categoryLabel = {
  video: 'Video',
  podcast: 'Podcast',
  major: 'Major Event',
  controversy: 'Controversy',
}

export const linkTypeIcons = {
  spotify: <BsSpotify/>,
  youtube: <BsYoutube/>,
}

export const linkTypeDescription = {
  spotify: "Listen on Spotify",
  youtube: "Watch on YouTube",
}

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

  const links = info.links && info.links.map(l => ({
    label: linkTypeDescription[l.type],
    target: "_blank",
    href: l.url,
    icon: linkTypeIcons[l.type],
  }))

  const roleSort = {
    creator: -1,
    subject: 0,
    host: 1,
    guest: 2,
    topic: 3,
    crew: 4
  }

  const sortPeopleByRole = (a, b) => {
    if (!a) {
      return 1
    }
    if (!b) {
      return -1
    }
    const diff = roleSort[a.role] - roleSort[b.role]
    if (diff === 0) {
      return a.person_id.localeCompare(b.person_id)
    }
    return diff
  }

  const columns = [
    {
      name: "key",
      render: t => t ? t.key : ''
    },
    {
      name: "value",
      render: t => t ? t.value : ''
    },
  ]

  const peopleColumns = [
    {
      render: pRef => {
        try {
          if (!people) {
            return <div></div>
          }
          const person = people.find(p => p.person_id === pRef.person_id)
          if (!person || !person.thumb) {
            return (<BsPerson style={{ width: "32px", height: "32px" }} />)
          }
          return (<EuiImage alt={person.display_name || `${person.first_name} ${person.last_name}`} width={32} height={32} src={person.thumb} />)
        } catch (err) {
          console.error(err)
        }
      },
      width: "50",
    },
    {
      render: pRef => {
        if (!people) {
          return ''
        }
        const person = people.find(p => p.person_id === pRef.person_id)
        if (!person) {
          return ''
        }
        return <Link to={`/people/${person.person_id}`}>{person.display_name || `${person.first_name} ${person.last_name}`}</Link>
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
      <EuiPanel color="transparent" hasShadow={false}>
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
            <EuiBadge color={categoryColor[info.category]}>
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
          <EuiBasicTable responsive={false} items={info.people ? [...info.people].sort(sortPeopleByRole) : []} columns={peopleColumns} />
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
          <EuiBasicTable responsive={false} items={info.tags} columns={columns} />
        </EuiPanel>)}
      </EuiFlexGroup>
    </EuiFlexItem>)}
  </EuiFlexGroup>)

  return (<div>{infoDom}{isEditing && editingControlsDom}</div>)
}

const onSaveDoc = (dispatch, setInfo) => async (event) => {
  await axios.put(`/api/events/${event.event_id}`, event)
  // dispatch(addToast({
  //   title: 'Saved',
  //   color: 'success',
  // }))
  dispatch(setEvent(event))
  //setInfo(event)
}

export const categoryColor = {
  podcast: '#32cf69',
  video: '#5bd9d9',
  major: '#e375eb',
  controversy: '#eb635b',
}

export default Info;