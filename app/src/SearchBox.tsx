import React from 'react'
import {
  EuiSearchBar,
  Query,
  SearchFilterConfig
} from '@elastic/eui'
import { useDispatch, useSelector } from 'react-redux'
import { setAll as setAllEvents } from './data/eventsSlice'
import axios from 'axios'

const SearchBox = ({
  setQuery,
  query,
}) => {
  const [searchAbortController, setSearchAbortController] = React.useState(new AbortController())
  const [isLoading, setLoading] = React.useState(false)
  const dispatch = useDispatch()
  const people = useSelector(state => state.people.value)

  const fields = {
    person: {
      type: "string",
      valueDescription: "the person",
      validate: v => {
        if (people.find(p => p.person_id === v) === undefined) {
          throw new Error(`Person with ID [${v}] not found`)
        }
      }
    },
    category: {
      type: "string",
      valueDescription: "the category of the event"
    },
    date: {
      type: "date",
      valueDescription: "the date of the event"
    },
  }

  const nestedFields = [
    "person",
    "date"
  ]

  const filters: SearchFilterConfig[] = [
    {
      type: 'field_value_selection',
      field: 'person',
      name: 'Person',
      multiSelect: 'or',
      options: (people && people.map(p => ({
        value: p.person_id,
        name: p.display_name || `${p.first_name} ${p.last_name}`,
      }))) || []
    },
    {
      type: 'field_value_selection',
      field: 'category',
      name: 'Category',
      multiSelect: 'or',
      options: [
        {
          "value": "video",
          "name": "Video",
        },
        {
          "value": "podcast",
          "name": "Podcast",
        },
        {
          "value": "major",
          "name": "Major Event",
        },
        {
          "value": "controversy",
          "name": "Controversy",
        }
      ],
    }
  ]

  return (<div><EuiSearchBar
      key="search"
      onChange={q => {
        if (q.query) {
          setQuery(q.query)
        }
      }}
      query={query}
      box={{
        incremental: true,
        schema: {
          fields: fields,
        },
        isLoading,
      }}
      filters={filters}
  /></div>)
}

export default SearchBox;