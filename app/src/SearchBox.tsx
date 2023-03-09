import React from 'react'
import {
  EuiSearchBar,
  Query,
  SearchFilterConfig
} from '@elastic/eui'
import { useDispatch, useSelector } from 'react-redux'
import { setAll as setAllEvents } from './data/eventsSlice'
import axios from 'axios'
import { DateTime } from 'luxon'

const SearchBox = () => {
  const [searchAbortController, setSearchAbortController] = React.useState(new AbortController())
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
    }
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
      options: people && people.map(p => ({
        value: p.person_id,
        name: p.display_name || `${p.first_name} ${p.last_name}`,
      }))
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
          console.log(q)
          console.log(Query.toESQuery(q.query))
          onSearchChange(dispatch, searchAbortController, setSearchAbortController, nestedFields)(q.query)
        }
      }}
      box={{
        incremental: false,
        schema: {
          fields: fields,
        },
      }}
      filters={filters}
  /></div>)
}

const onSearchChange = (dispatch, searchAbortController, setSearchAbortController, nestedFields) => async (search: Query) => {
  const searchWithoutNestedFields = nestedFields.reduce((acc, nestedField) => acc.removeSimpleFieldClauses(nestedField).removeOrFieldClauses(nestedField), search)
  console.log("searchWithoutNestedFields", searchWithoutNestedFields)
  searchAbortController.abort()
  const newSearchAbortController = new AbortController()
  setSearchAbortController(newSearchAbortController)
  const esQuery = Query.toESQuery(searchWithoutNestedFields)
  console.log("esQuery", esQuery)
  const response = await axios.post('/api/events', esQuery, {
    signal: newSearchAbortController.signal
  })
  // Flat array of person id
  response.data.forEach(e => {
    e.person = e.people.map(p => p.person_id)
    e.date = e.start_date
  })
  const filteredEvents = Query.execute(search, response.data)
  dispatch(setAllEvents(filteredEvents))
}

export default SearchBox;