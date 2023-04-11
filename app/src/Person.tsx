import React from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  Comparators,
  Criteria,
  EuiBadge,
  EuiBasicTable,
  EuiBasicTableColumn,
  EuiBreadcrumb,
  EuiBreadcrumbs,
  EuiButton,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHorizontalRule,
  EuiImage,
  EuiLink,
  EuiPageHeader,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTextColor,
  EuiToolTip,
  useIsWithinBreakpoints,
} from '@elastic/eui'
import { useDispatch, useSelector } from 'react-redux'
import axios from 'axios'
import { DateTime } from 'luxon'
import { 
  roleLabel as roleLabels,
  categoryLabel as categoryLabels,
  categoryColor as categoryColors,
  linkTypeIcons,
  linkTypeDescription,
} from './Info'

const Person = ({
  isEditing,
}) => {
  const [personDoc, setPersonDoc] = React.useState('')
  const personId = useParams().person
  const [totalEvents, setTotalEvents] = React.useState(0)
  const people = useSelector(state => state.people.value)
  const soundbites = useSelector(state => state.soundbites.value && state.soundbites.value.filter(s => s.person_id === personId))
  const [isLoading, setLoading] = React.useState(false)
  // const events = useSelector(state => state.events.value && state.events.value
  //   .map(e => {
  //     const person = e.people.find(p => p.person_id === personId)
  //     if (!person) {
  //       return e
  //     }
  //     return Object.assign({
  //       role: person.role,
  //       roleLabel: roleLabels[person.role],
  //       categoryLabel: categoryLabels[e.category],
  //       categoryColor: categoryColors[e.category],
  //     }, e)
  //   })
  //   .filter(e => e.role))
  const [events, setEvents] = React.useState(null)
  const steamies = useSelector(state => state.steamies.value && state.steamies.value.filter(s => personId && s.people.find(p => p.person_id.find(p2 => p2 === personId))))
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const [tableProps, setTableProps] = React.useState({
    pageIndex: 0,
    pageSize: 10,
    sortField: 'start_date',
    sortDirection: 'asc',
  })
  const isMobile = useIsWithinBreakpoints(['xs', 's'])

  const person = people && people.find(p => p.person_id === personId)

  React.useEffect(() => {
    if (!personDoc && person) {
      const personMinusOtherFields = Object.assign({}, person)
      personMinusOtherFields.event_count = undefined
      setPersonDoc(JSON.stringify(personMinusOtherFields, null, '    '))
    }
  }, [personDoc, setPersonDoc, person])

  React.useEffect(() => {
    if (!events) {
      fetchEvents(personId, tableProps, setEvents, setTotalEvents, setLoading)
    }
  }, [events])

  React.useEffect(() => {
    fetchEvents(personId, tableProps, setEvents, setTotalEvents, setLoading)
  }, [tableProps])

  if (!person) {
    return null
  }

  const isDisplayNameDifferent = person.display_name && person.display_name !== `${person.first_name} ${person.last_name}`

  const breadcrumbs: EuiBreadcrumb[] = [
    {
      text: 'People',
      onClick: () => {
        navigate('/people')
      }
    },
    {
      text: person && (person.display_name || `${person.first_name} ${person.last_name}`),
    },
  ]

  const imgWidth = "200px"

  const soundbitesColumns: Array<EuiBasicTableColumn<any>> = [
    {
      render: soundbite => soundbite ? (soundbite.quote ? `“${soundbite.quote}”` : soundbite.alt) : '',
    },
    {
      width: '50px',
      actions: [
        {
          name: 'Play',
          description: 'Play the sound',
          type: 'icon',
          icon: 'play',
          onClick: soundbite => {
            soundbite && new Audio(soundbite.sound_file).play()
          }
        }
      ]
    }
  ]

  const editingControls = (<div>
    <EuiHorizontalRule/>
    <pre>
      <textarea cols={120} rows={30} value={personDoc} onChange={e => setPersonDoc(e.target.value)} />
    </pre>
    <EuiButton onClick={() => onCreatePerson(JSON.parse(personDoc), dispatch)}>Create</EuiButton>
  </div>)

  const eventsColumns: Array<EuiBasicTableColumn<any>> = [
    {
      field: 'name',
      sortable: true,
      name: 'Name',
      render: (a, b) => <Link to={isMobile ? `/events/${b.event_id}` : `/?event_id=${b.event_id}`}>{a}</Link>,
      mobileOptions: {
        width: '100%',
        header: false,
      }
    },
    {
      field: 'start_date',
      name: 'Date',
      sortable: true,
      render: a => DateTime.fromMillis(a).toLocaleString(DateTime.DATE_HUGE),
      mobileOptions: {
        header: false,
        render: a => <EuiText size="s" color="subdued">{DateTime.fromMillis(a.start_date).toLocaleString(DateTime.DATE_SHORT)}</EuiText>,
      }
    },
    {
      field: 'category',
      name: 'Category',
      sortable: true,
      render: (a, b) => <EuiBadge color={b.categoryColor}>{b.categoryLabel}</EuiBadge>,
      mobileOptions: {
        header: false,
      },
    },
    {
      name: 'Links',
      actions: isMobile ? [] : Object.keys(linkTypeIcons).map(linkType => ({
        render: a => {
          return (<EuiToolTip content={linkTypeDescription[linkType]}>
            <EuiLink href={a.links.find(l => l.type === linkType).url} target="_blank" external={false}>
              {linkTypeIcons[linkType]}
            </EuiLink>
          </EuiToolTip>)
        },
        available: a => a.links.find(l => l.type === linkType)
      })),
    }
  ]

  const steamiesColumns: Array<EuiBasicTableColumn<any>> = [
    {
      render: s => s.year,
      width: "60"
    },
    {
      render: s => s.name,
    },
    {
      render: s => {
        const myNominee = s.people.find(p => p.person_id.find(p2 => p2 === personId))

        if (!myNominee.won) {
          return <EuiText color="subdued">Nominated</EuiText>
        }

        return <EuiText><b>&#127942;&nbsp;Won</b></EuiText>
      },
      width: "100"
    }
  ]

  const {
    pageSize,
    pageIndex,
    sortField,
    sortDirection,
  } = tableProps

  const onChange = ({ page, sort }) => {
    const newTableProps = {
      pageIndex: page && page.index,
      pageSize: page && page.size,
      sortField: sort.field,
      sortDirection: sort.direction,
    }
    setTableProps(newTableProps)
  }
  // let sortedEvents
  // if (sortField) {
  //   sortedEvents = events && events.slice(0).sort(Comparators.property(sortField, (a, b) => {
  //     if (typeof a === 'string' || a instanceof String) {
  //       if (sortDirection === 'asc') {
  //         return a.localeCompare(b)
  //       } else {
  //         return b.localeCompare(a)
  //       }
  //     } else {
  //       if (sortDirection === 'asc') {
  //         return a - b
  //       } else {
  //         return b - a
  //       }
  //     }
  //   }))
  // } else {
  //   sortedEvents = events
  // }
  // const pageOfEvents = () => {
  //   if (!pageIndex && !pageSize) {
  //     return sortedEvents
  //   }
  //   const startIndex = pageIndex * pageSize
  //   return sortedEvents.slice(startIndex, Math.min(startIndex + pageSize, sortedEvents.length))
  // }
  let eventsTable
  if (!events || events.length === 0) {
    eventsTable = null
  } else {
    eventsTable = (<div>
      <EuiHorizontalRule />
      <EuiText>
        <h3>Appears in</h3>
      </EuiText>
      <EuiSpacer />
      <EuiBasicTable
        columns={eventsColumns}
        items={events}
        loading={isLoading}
        pagination={events.length < 10 ? undefined : {
          pageIndex,
          pageSize,
          totalItemCount: totalEvents,
          pageSizeOptions: [10, 25, 50],
        }}
        onChange={onChange}
        sorting={{
          enableAllColumns: true,
          sort: {
            field: sortField,
            direction: sortDirection,
          }
        }}
        rowProps={{
          style: {
            background: 'none',
          }
        }}
        tableLayout="auto"
      />
    </div>)
  }

  const sidePanels = ((soundbites && soundbites.length > 0) || (person.aliases && person.aliases.length > 0) || (steamies && steamies.length > 0)) && (
    <EuiFlexItem grow={1}>
      <EuiFlexGroup direction="column">
        {soundbites && soundbites.length > 0 && (<EuiFlexItem grow={false}>
          <EuiPanel grow={false}>
            <EuiText>
              <h4>Soundbites</h4>
            </EuiText>
            <EuiBasicTable responsive={false} items={soundbites} columns={soundbitesColumns} />
          </EuiPanel>
        </EuiFlexItem>)}
        {person.aliases && person.aliases.length > 0 && (<EuiFlexItem grow={false}>
          <EuiPanel grow={false}>
            <EuiText>
              <h4>Also Known As</h4>
            </EuiText>
            <EuiBasicTable responsive={false} items={person.aliases} columns={[{render: a => a}]} />
          </EuiPanel>
        </EuiFlexItem>)}
        {steamies && steamies.length > 0 && (<EuiFlexItem grow={false}>
          <EuiPanel grow={false}>
            <EuiText>
              <h4>Steamies</h4>
            </EuiText>
            <EuiBasicTable responsive={false} items={steamies.sort((a, b) => b.year - a.year)} columns={steamiesColumns} />
          </EuiPanel>
        </EuiFlexItem>)}
      </EuiFlexGroup>
    </EuiFlexItem>
  )

  return (<div>
    <EuiBreadcrumbs breadcrumbs={breadcrumbs} responsive={false} />
    <EuiSpacer size="xl" />
    <EuiFlexGroup gutterSize="xl" >
      <EuiFlexItem grow={3}>
        <EuiFlexGroup direction="column">
          <EuiFlexItem grow={false}>
            <EuiFlexGroup alignItems="baseline" gutterSize="xl">
              {person.thumb && (<EuiFlexItem grow={false}>
                <EuiImage style={{width: imgWidth, height: imgWidth}} alt="thumbnail" src={person.thumb} />  
              </EuiFlexItem>)}
              <EuiFlexItem grow={false}>
                <EuiPageHeader pageTitle={person.display_name || `${person.first_name} ${person.last_name}`} />
                {isDisplayNameDifferent && (<EuiText>
                  <EuiTextColor color="subdued">{`${person.first_name} ${person.last_name}`}</EuiTextColor>
                </EuiText>)}
                {person.description && <EuiFlexItem grow>
                  <EuiSpacer />
                  <EuiText>{person.description}</EuiText>
                </EuiFlexItem>}
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>
          {isMobile && sidePanels}
          {eventsTable}
        </EuiFlexGroup>
      </EuiFlexItem>
      {!isMobile && sidePanels}
    </EuiFlexGroup>
    <EuiSpacer size="xl" />
    {isEditing && editingControls}
  </div>)
}

async function onCreatePerson(personDoc, dispatch) {
  await axios.put(`/api/people/${personDoc.person_id}`, personDoc)
  // dispatch(addToast({
  //   color: 'success',
  //   title: 'Added used',
  // }))
}

const fetchEvents = async (personId, { pageIndex, pageSize, sortField, sortDirection }, setEvents, setTotalEvents, setLoading) => {
  setLoading(true)
  const response = await axios.post(`/api/events?person=${personId}`, {
    size: pageSize,
    sort: { [sortField] : sortDirection },
    from: pageIndex * pageSize,
  })
  setEvents(response.data.results.map(e => e.event).map(e => {
    const person = e.people.find(p => p.person_id === personId)
    if (!person) {
      return e
    }
    return Object.assign({
      role: person.role,
      roleLabel: roleLabels[person.role],
      categoryLabel: categoryLabels[e.category],
      categoryColor: categoryColors[e.category],
    }, e)
  }))
  setTotalEvents(response.data.total)
  setLoading(false)
}

export default Person