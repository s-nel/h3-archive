import React from 'react'
import {
  EuiBadge,
  EuiCard,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiImage,
  EuiPageHeader,
  EuiPanel,
  EuiSearchBar,
  EuiSkeletonRectangle,
  EuiSpacer,
  EuiText,
  EuiToolTip,
  Query,
  useIsWithinBreakpoints,
} from '@elastic/eui'
import { useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'

const categoryLabel = {
  creator: 'Creator',
  crew: 'Crew',
  guest: 'Guest',
  enemy: 'Enemy',
  friend: 'Friend',
  family: 'Family',
  lore: 'Lore',
}

const People = ({
  isEditing,
  addToast,
}) => {
  const [force, setForce] = React.useState(0)
  const people = useSelector((state) => {
    const rawPeople = state.people.value
    const events = state.events.value
    const withEventCounts = events && rawPeople && rawPeople.map(person => {
      const eventCount = events && events.reduce((acc, e) => {
        if (e.people.find(p => p.person_id === person.person_id)) {
          return acc + 1
        } else {
          return acc
        }
      }, 0)
      return {
        ...person,
        event_count: eventCount,
      }
    })
    const sorted = withEventCounts && withEventCounts.sort((a, b) => {
      const diff = b.event_count - a.event_count
      if (diff !== 0) {
        return diff
      }
      const aName = a.display_name || `${a.first_name} ${a.last_name}`
      const bName = b.display_name || `${b.first_name} ${b.last_name}`
      return aName.localeCompare(bName)
    })
    return sorted
  })
  const [filteredPeople, setFilteredPeople] = React.useState([])
  const navigate = useNavigate()
  const isMobile = useIsWithinBreakpoints(['xs', 's'])

  const setQuery = (query) => {
    const existingParams = new URLSearchParams(window.location.search)
    if (existingParams.get('q') !== query.text) {
      if (!query.text || query.text === '') {
        existingParams.delete('q')
      } else {
        existingParams.set('q', query.text)
      }
      const newurl = `${window.location.protocol}//${window.location.host}${window.location.pathname}?${existingParams.toString()}`
      window.history.replaceState({path:newurl},'',newurl)
      setForce(force + 1)
    }
  }
  const searchParams = new URLSearchParams(window.location.search)
  const query = searchParams.get('q') && Query.parse(searchParams.get('q'))

  React.useEffect(() => {
    if (people) {
      if (query) {
        setFilteredPeople(Query.execute(query, people))
      } else {
        setFilteredPeople(people)
      }
    }
  }, [people, searchParams.get('q'), setFilteredPeople])

  if (!people) {
    return (<div>
      <EuiPageHeader pageTitle="People" />
      <EuiSpacer size="xl" />
      <PeopleSearch query={query} setQuery={setQuery} />
      <EuiSpacer size="m" />
      <EuiFlexGroup wrap>
        <EuiFlexItem grow={false}>
          <EuiSkeletonRectangle width={200} height={292} />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiSkeletonRectangle width={200} height={292} />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiSkeletonRectangle width={200} height={292} />
        </EuiFlexItem>
      </EuiFlexGroup>
    </div>)
  }

  return (<div>
    <EuiPageHeader pageTitle="People" />
    <EuiSpacer size={isMobile ? "m" : "xl"} />
    <PeopleSearch query={query} setQuery={setQuery} />
    <EuiSpacer size="m" />
    <EuiFlexGroup wrap justifyContent={isMobile ? 'spaceEvenly' : undefined} responsive={false}>
      {filteredPeople && filteredPeople.map((p, i) => {
        const imgWidth = isMobile ? "125px" : (i < 10 ? "200px" : (i < 40 ? "175px" : (i < 75 ? "140px" : (i < 150 ? "110px" : "80px"))))
        const innerWidth = isMobile ? "100px" : (i < 10 ? "168px" : (i < 40 ? "143px" : (i < 75 ? "108px" : (i < 150 ? "110px": "80px"))))
        const missingImg = (<EuiFlexGroup 
          alignItems="center" 
          responsive={false}
          justifyContent="center" 
          style={{width: imgWidth, height: imgWidth}}
        >
          <EuiFlexItem grow={false}>
            <EuiIcon size="xxl" type="user" />
          </EuiFlexItem>
        </EuiFlexGroup>)
        return (<EuiFlexItem key={p.person_id} grow={false}>
          {(i < 75 || isMobile) && (<EuiCard
            title={(<EuiText style={{width: innerWidth, textOverflow: 'ellipsis', overflow: 'hidden', fontWeight: 'bold', whiteSpace: 'nowrap'}}>{p.display_name || `${p.first_name} ${p.last_name}`}</EuiText>)}
            textAlign="left"
            style={{width: imgWidth}}
            titleSize="xs"
            grow={false}
            paddingSize="s"
            onClick={() => {
              navigate(`/people/${p.person_id}`)
            }}
            image={p.thumb ? (<div>
              <img
                style={{width: imgWidth}}
                src={p.thumb}
                alt={`${p.first_name} ${p.last_name}`}
              />
            </div>) : missingImg}
            footer={(<div>
              <EuiBadge color="primary">{categoryLabel[p.category]}</EuiBadge>
              <EuiBadge color="hollow">{p.event_count}</EuiBadge>
              {p.is_beefing && <EuiBadge color="default">&#x1F969;</EuiBadge>}
            </div>)}
          />)}
          {(i >= 75 && !isMobile) && (<EuiToolTip content={p.display_name || `${p.first_name} ${p.last_name}`} position="bottom">
            <EuiPanel
              style={{width: imgWidth, height: imgWidth}}
              paddingSize="none"
              onClick={() => {
                navigate(`/people/${p.person_id}`)
              }}
            >
              {p.thumb ? (<div>
                <EuiImage
                  style={{width: imgWidth, height: imgWidth, borderRadius: "6px"}}
                  src={p.thumb}
                  alt={`${p.first_name} ${p.last_name}`}
                />
              </div>) : missingImg}
            </EuiPanel>
          </EuiToolTip>)}
        </EuiFlexItem>)
      })}
    </EuiFlexGroup>
  </div>)
}

const PeopleSearch = ({
  query,
  setQuery,
}) => {
  const schema = {
    flags: [
      'is_beefing'
    ],
    first_name: {
      type: 'string',
    },
    last_name: {
      type: 'string',
    },
    aliases: {
      type: 'string',
    },
    display_name: {
      type: 'string',
    },
    category: {
      type: 'string',
    }
  }

  const filters = [
    {
      type: 'field_value_selection',
      field: 'category',
      name: 'Category',
      multiSelect: 'or',
      options: [
        {
          value: 'creator',
          name: 'Creator',
        },
        {
          value: 'crew',
          name: 'Crew',
        },
        {
          value: 'friend',
          name: 'Friend',
        },
        {
          value: 'enemy',
          name: 'Enemy',
        },
        {
          value: 'guest',
          name: 'Guest',
        }
      ]
    },
    {
      type: 'is',
      field: 'is_beefing',
      name: 'Is Beefing \uD83E\uDD69',
    }
  ]

  return (<div>
    <EuiSearchBar
      onChange={onSearch(setQuery)}
      query={query}
      filters={filters}
      box={{
        incremental: true,
        schema: schema,
      }}
    />
  </div>)
}

const onSearch = setQuery => query => {
  setQuery(query.query)
}

export default People