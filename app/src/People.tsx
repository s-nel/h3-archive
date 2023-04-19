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
import { useContainerDimensions } from './useContainerDimensions'
import { filter } from 'd3'
import axios from 'axios'
import { setTitle } from './util'

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
  const peopleParentRef = React.useRef(null)
  const [eventCounts, setEventCounts] = React.useState(null)
  const rawPeople = useSelector(state => state.people.value)
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
  })
  const [filteredPeople, setFilteredPeople] = React.useState([])
  const navigate = useNavigate()
  const isMobile = useIsWithinBreakpoints(['xs', 's'])

  React.useEffect(() => {
    if (!eventCounts) {
      fetchEventCounts(setEventCounts)
    }
  }, [eventCounts])

  const { width: peopleParentWidth } = useContainerDimensions(peopleParentRef)

  React.useEffect(() => {
    setTitle('People')
  }, [people && people.length])

  const itemWidth = i => {
    const imgWidth = {
      mobile: 125,
      xl: 200,
      l: 175,
      m: 140,
      s: 110,
      xs: 80
    }
    const innerWidth = {
      mobile: 100,
      xl: 168,
      l: 143,
      m: 108,
      s: 80,
      xs: 80,
    }

    if (isMobile) {
      return {
        img: imgWidth.mobile,
        inner: innerWidth.mobile,
      }
    }

    if (!peopleParentWidth) {
      return {
        img: imgWidth.xl,
        inner: innerWidth.xl,
      } 
    }

    const gap = 24
    const xlRowSize = Math.floor(peopleParentWidth / (200 + gap))
    const lRowSize = Math.floor(peopleParentWidth / (175 + gap))
    const mRowSize = Math.floor(peopleParentWidth / (140 + gap))
    const sRowSize = Math.floor(peopleParentWidth / (110 + gap))
    
    if (i >= (xlRowSize + 2 * lRowSize + 3 * mRowSize + 4 * sRowSize)) {
      return {
        img: imgWidth.xs,
        inner: innerWidth.xs,
        rowBreakAfter: false,
        hideName: true,
      }
    }
    if (i >= (xlRowSize + 2 * lRowSize + 3 * mRowSize)) {
      return {
        img: imgWidth.s,
        inner: innerWidth.s,
        rowBreakAfter: i === (xlRowSize + 2 * lRowSize + 3 * mRowSize + 4 * sRowSize) - 1,
      }
    }
    if (i >= (xlRowSize + 2 * lRowSize)) {
      return {
        img: imgWidth.m,
        inner: innerWidth.m,
        rowBreakAfter: i === (xlRowSize + 2 * lRowSize + 3 * mRowSize) - 1,
      }
    }
    if (i >= xlRowSize) {
      return {
        img: imgWidth.l,
        inner: innerWidth.l,
        rowBreakAfter: i === (xlRowSize + 2 * lRowSize) - 1,
      }
    }
    return {
      img: imgWidth.xl,
      inner: innerWidth.xl,
      rowBreakAfter: i === xlRowSize - 1
    }
  }

  const kFormatter = num => {
    return Math.abs(num) > 999 ? Math.sign(num)*((Math.abs(num)/1000).toFixed(1)) + 'k' : Math.sign(num)*Math.abs(num)
  }

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
  }, [rawPeople, eventCounts, searchParams.get('q'), setFilteredPeople])

  if (!people) {
    return (<div>
      <EuiPageHeader pageTitle="People" />
      <EuiSpacer size="xl" />
      <PeopleSearch query={query} setQuery={setQuery} />
      <EuiSpacer size="m" />
      <EuiFlexGroup justifyContent={isMobile ? 'spaceEvenly' : undefined} responsive={false} wrap>
        <EuiFlexItem grow={false}>
          <EuiSkeletonRectangle width={itemWidth(0).img} height={isMobile ? 200 : 292} />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiSkeletonRectangle width={itemWidth(0).img} height={isMobile ? 200 : 292} />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiSkeletonRectangle width={itemWidth(0).img} height={isMobile ? 200 : 292} />
        </EuiFlexItem>
      </EuiFlexGroup>
    </div>)
  }

  return (<div>
    <EuiPageHeader pageTitle="People" />
    <EuiSpacer size={isMobile ? "m" : "xl"} />
    <PeopleSearch query={query} setQuery={setQuery} />
    <EuiSpacer size="m" />
    <EuiFlexGroup wrap ref={peopleParentRef} justifyContent={isMobile ? 'spaceEvenly' : undefined} responsive={false}>
      {filteredPeople && filteredPeople.map((p, i) => {
        const iwidth = itemWidth(i)
        const imgWidth = `${iwidth.img}px`
        const innerWidth = `${iwidth.inner}px`
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
        const rowBreak = iwidth.rowBreakAfter ? <EuiFlexItem key={`rowbreak-${i}`} style={{height: '0px', flexBasis: '100%'}} /> : undefined
        return [(<EuiFlexItem key={p.person_id} grow={false}>
          <EuiToolTip content={p.display_name || `${p.first_name} ${p.last_name}`} position="bottom">
            {(!iwidth.hideName || isMobile) ? (<EuiCard
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
                <EuiBadge color="hollow">{kFormatter(p.event_count)}</EuiBadge>
              </div>)}
            />) : ( <EuiPanel
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
            </EuiPanel>)}
          </EuiToolTip>
        </EuiFlexItem>), rowBreak,]
      })}
    </EuiFlexGroup>
  </div>)
}

const PeopleSearch = ({
  query,
  setQuery,
}) => {
  const isMobile = useIsWithinBreakpoints(['xs', 's'])

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
        incremental: !isMobile,
        schema: schema,
      }}
    />
  </div>)
}

const onSearch = setQuery => query => {
  setQuery(query.query)
}

const fetchEventCounts = async setEventCounts => {
  const response = await axios.get('/api/events/counts')
  console.log(response)
  setEventCounts(response.data)
}

export default People