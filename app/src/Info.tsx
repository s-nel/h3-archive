import React from 'react'
import _ from 'lodash'
import { DateTime, Duration } from 'luxon'
import { useDispatch, useSelector } from 'react-redux'
import { Link, useLocation } from 'react-router-dom'
import {
  EuiAccordion,
  EuiBadge,
  EuiBasicTable,
  EuiButton,
  EuiButtonIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHorizontalRule,
  EuiIcon,
  EuiImage,
  EuiListGroup,
  EuiPanel,
  EuiSkeletonText,
  EuiSpacer,
  EuiText,
  EuiTextColor,
  EuiTitle,
  EuiToolTip,
  useIsWithinBreakpoints,
} from '@elastic/eui'
import { BsSpotify, BsYoutube, BsPerson } from 'react-icons/bs'
import axios from 'axios'
import { add as addToast } from './data/toastsSlice'
import Transcript from './Transcript'
import Video from './Video'

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

const Info = ({ eventId, isEditing, highlights: overrideHighlights, }) => {    
  const [info, setinfo] = React.useState(null)
  const [searchAbortController, setSearchAbortController] = React.useState(new AbortController())
  const [isLoading, setLoading] = React.useState(false)
  const [modifiedDoc, setModifiedDoc] = React.useState(null)
  const dispatch = useDispatch()
  const people = useSelector(state => state.people.value)
  const isMobile = useIsWithinBreakpoints(['xs', 's'])
  const [ytVideo, setYtVideo] = React.useState(null)
  const ytVideoRef = React.useRef(null)
  const location = useLocation()
  const highlights = overrideHighlights || (location && location.state && location.state.highlights)
  const [isTranscriptShowing, setTranscriptShowing] = React.useState(!!highlights)
  const highlightTerms = highlights && highlights['transcription.text'] && highlights['transcription.text'].reduce((acc, h) => {
    Array.from(h.matchAll(/<em>([^<]+)<\/em>/g), m => {
      if (m.length >= 1) {
        acc[m[1]] = true
      }
    })
    return acc
  }, {})

  React.useEffect(() => {
    if ((info && !modifiedDoc) || (info && info.event_id !== modifiedDoc.event_id)) {
      setModifiedDoc({
        event_id: info.event_id,
        jsonStr: JSON.stringify(info, null, "    ")
      })
    }
  }, [info, modifiedDoc])

  //console.log('event_id', eventId, info)

  React.useEffect(() => {
    if (eventId) {
      fetchEvent(eventId, setinfo, setLoading, setSearchAbortController, searchAbortController)
      setTranscriptShowing(!!highlights)
    }
  }, [eventId])

  if (isLoading) {
    return <div><EuiSpacer size="xl" /><EuiSkeletonText /></div>
  }

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

  const infoDom = (<EuiFlexGroup gutterSize={isMobile ? "s" : undefined}>
    <EuiFlexItem grow={3}>
      <EuiFlexGroup direction="column">
        <EuiFlexItem grow={false}>
          <EuiPanel paddingSize="xs" color="transparent" hasShadow={false}>
            <EditEventButton eventId={eventId} />
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
                <EuiFlexGroup responsive={false}>
                  <EuiFlexItem grow={false}>
                    <EuiBadge color={categoryColor[info.category]}>
                      {categoryLabel[info.category]}
                    </EuiBadge>
                  </EuiFlexItem>
                </EuiFlexGroup>
              </EuiFlexItem>
            </EuiFlexGroup>
            {info.description && [<EuiHorizontalRule key="1" size="half" />,
            <EuiText key="2">
              <div dangerouslySetInnerHTML={{__html: info.description}}></div>
            </EuiText>]}
            {isLoading && [<EuiHorizontalRule key="1" size="half" />, <EuiSkeletonText key="2" />]}
          </EuiPanel>
        </EuiFlexItem>
        {!isMobile && info && info.links && info.links.some(l => l.type === 'youtube') && (<EuiFlexItem grow={false}>
          <EuiPanel paddingSize="xs" color="transparent" hasShadow={false}>
            <EuiTitle size="xs"><h4>Video</h4></EuiTitle>  
            <EuiSpacer size="s" />
            <Video ytVideoRef={ytVideoRef} event={info} onVideoReady={e => setYtVideo(e.target)} />
          </EuiPanel>
        </EuiFlexItem>)}
        {!isMobile && info && info.transcription && (<EuiFlexItem grow={false}>
          <EuiPanel paddingSize="xs" color="transparent" hasShadow={false}>
            <EditEventButton eventId={eventId} />
            <EuiAccordion 
              forceState={isTranscriptShowing ? 'open' : 'closed'} 
              onToggle={(isOpen) => {
                setTranscriptShowing(isOpen)
              }} 
              buttonContent={<EuiText><h4>Transcript</h4></EuiText>}
            >
              <EuiSpacer size="s" />
              <Transcript event={info} ytVideo={ytVideo} ytVideoRef={ytVideoRef} highlightTerms={highlightTerms} />
            </EuiAccordion>
          </EuiPanel>
        </EuiFlexItem>)}
      </EuiFlexGroup>
    </EuiFlexItem>
    {isMobile && info && info.links && info.links.some(l => l.type === 'youtube') && (<EuiFlexItem grow={false}>
      <EuiPanel paddingSize="none">
        <Video ytVideoRef={ytVideoRef} event={info} onVideoReady={e => setYtVideo(e.target)} />
      </EuiPanel>
    </EuiFlexItem>)}
    {isMobile && info && info.transcription && (<EuiFlexItem grow={false}>
      <EuiPanel>
        <EuiText><h4>Transcript</h4></EuiText>
        <EuiSpacer size="s" />
        <Transcript event={info} ytVideo={ytVideo} ytVideoRef={ytVideoRef} highlightTerms={highlightTerms} />
      </EuiPanel>
    </EuiFlexItem>)}
    {((links && links.length > 0) || (info.tags && info.tags.length > 0) || (info.people && info.people.length > 0)) && (<EuiFlexItem grow={1}>
      <br size="xl"/>
      <EuiFlexGroup direction="column">
        {info.people && info.people.length > 0 && (<EuiPanel grow={false}>
          <EditEventButton eventId={eventId} />
          <EuiText>
            <h4>People</h4>
          </EuiText>
          <EuiBasicTable responsive={false} items={info.people ? [...info.people].sort(sortPeopleByRole) : []} columns={peopleColumns} />
        </EuiPanel>)}
        {links && links.length > 0 && (<EuiPanel grow={false}>
          <EditEventButton eventId={eventId} />
          <EuiText>
            <h4>Links</h4>
          </EuiText>
          <EuiHorizontalRule margin="s"/>
          <EuiListGroup listItems={links} color="primary" size="s" />
        </EuiPanel>)}
        {info.tags && info.tags.length > 0 && (<EuiPanel grow={false}>
          <EditEventButton eventId={eventId} />
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

const fetchEvent = async (eventId, setEvent, setFetching, setSearchAbortController, searchAbortController) => {
  setFetching(true)
  const newSearchAbortController = new AbortController()
  if (searchAbortController) {
    searchAbortController.abort()
  }
  setSearchAbortController(newSearchAbortController)
  const event = await axios.get(`/api/events/${eventId}?with_transcript=true`, {
    signal: newSearchAbortController.signal,
  })
  setEvent(event.data)
  setFetching(false)
}

export const categoryColor = {
  podcast: '#32cf69',
  video: '#5bd9d9',
  major: '#e375eb',
  controversy: '#eb635b',
}

const EditEventButton = ({
  eventId,
}) => {
  const [hovering, setHovering] = React.useState(false)
  const isMobile = useIsWithinBreakpoints(['xs', 's'])

  return (<div style={{ position: 'relative' }}>
    <div style={{ position: 'absolute', top: '0px', right: '0px', opacity: hovering || isMobile ? 1 : '.5' }} onMouseEnter={() => {setHovering(true)}} onMouseLeave={() => {setHovering(false)}}>
      <EuiToolTip content="Suggest an edit">
        <EuiButtonIcon target="_blank" href={`https://github.com/s-nel/h3-archive/edit/main/content/events/${eventId}.json`} iconType="pencil" display="base" />
      </EuiToolTip>
    </div>
  </div>)
}

export default Info;