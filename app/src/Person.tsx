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
  const people = useSelector(state => state.people.value)
  const soundbites = useSelector(state => state.soundbites.value && state.soundbites.value.filter(s => s.person_id === personId))
  const events = useSelector(state => state.events.value && state.events.value
    .map(e => {
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
    })
    .filter(e => e.role))
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const [tableProps, setTableProps] = React.useState({
    pageIndex: 0,
    pageSize: 10,
    sortField: 'start_date',
    sortDirection: 'asc',
  })

  const person = people && people.find(p => p.person_id === personId)

  console.log(events, people, person)

  React.useEffect(() => {
    if (!personDoc && person) {
      const personMinusOtherFields = Object.assign({}, person)
      personMinusOtherFields.event_count = undefined
      setPersonDoc(JSON.stringify(personMinusOtherFields, null, '    '))
    }
  }, [personDoc, setPersonDoc, person])

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
      render: (a, b) => <Link to={`/?event_id=${b.event_id}`}>{a}</Link>
    },
    {
      field: 'roleLabel',
      name: 'Role',
      sortable: true,
      render: a => a
    },
    {
      field: 'start_date',
      name: 'Date',
      sortable: true,
      render: a => DateTime.fromMillis(a).toLocaleString(DateTime.DATE_HUGE)
    },
    {
      field: 'categoryLabel',
      name: 'Category',
      sortable: true,
      render: (a, b) => <EuiBadge color={b.categoryColor}>{b.categoryLabel}</EuiBadge>,
    },
    {
      name: 'Links',
      actions: Object.keys(linkTypeIcons).map(linkType => ({
        render: a => {
          return (<EuiToolTip content={linkTypeDescription[linkType]}>
            <EuiLink href={a.links.find(l => l.type === linkType).url} target="_blank" external={false}>
              {linkTypeIcons[linkType]}
            </EuiLink>
          </EuiToolTip>)
        },
        available: a => a.links.find(l => l.type === linkType)
      }))
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
  let sortedEvents
  if (sortField) {
    sortedEvents = events.slice(0).sort(Comparators.property(sortField, (a, b) => {
      if (typeof a === 'string' || a instanceof String) {
        if (sortDirection === 'asc') {
          return a.localeCompare(b)
        } else {
          return b.localeCompare(a)
        }
      } else {
        if (sortDirection === 'asc') {
          return a - b
        } else {
          return b - a
        }
      }
    }))
  } else {
    sortedEvents = events
  }
  const pageOfEvents = () => {
    if (!pageIndex && !pageSize) {
      return sortedEvents
    }
    const startIndex = pageIndex * pageSize
    return sortedEvents.slice(startIndex, Math.min(startIndex + pageSize, sortedEvents.length))
  }
  let eventsTable
  if (!sortedEvents || sortedEvents.length === 0) {
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
        items={pageOfEvents()}
        pagination={events.length < 10 ? undefined : {
          pageIndex,
          pageSize,
          totalItemCount: events.length,
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

  return (<div>
    <EuiBreadcrumbs breadcrumbs={breadcrumbs} />
    <EuiSpacer size="xl" />
    <EuiFlexGroup gutterSize="xl">
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
          {eventsTable}
        </EuiFlexGroup>
      </EuiFlexItem>
      {((soundbites && soundbites.length > 0) || (person.aliases && person.aliases.length > 0)) && (
        <EuiFlexItem grow={1}>
          <EuiFlexGroup direction="column">
            {soundbites && soundbites.length > 0 && (<EuiFlexItem grow={false}>
              <EuiPanel grow={false}>
                <EuiText>
                  <h4>Soundbites</h4>
                </EuiText>
                <EuiBasicTable items={soundbites} columns={soundbitesColumns} />
              </EuiPanel>
            </EuiFlexItem>)}
            {person.aliases && person.aliases.length > 0 && (<EuiFlexItem grow={false}>
              <EuiPanel grow={false}>
                <EuiText>
                  <h4>Also Known As</h4>
                </EuiText>
                <EuiBasicTable items={person.aliases} columns={[{render: a => a}]} />
              </EuiPanel>
            </EuiFlexItem>)}
          </EuiFlexGroup>
        </EuiFlexItem>
      )}
    </EuiFlexGroup>
    <EuiSpacer size="xl" />
    {isEditing && editingControls}
  </div>)
}

async function onCreatePerson(personDoc, dispatch) {
  await axios.put(`/api/people/${personDoc.person_id}`, personDoc)
  dispatch(

  )
  // dispatch(addToast({
  //   color: 'success',
  //   title: 'Added used',
  // }))
}

export default Person