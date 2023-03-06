import React from 'react'
import {
  EuiFieldSearch
} from '@elastic/eui'
import { useDispatch } from 'react-redux'
import { setAll as setAllEvents } from './data/eventsSlice'
import axios from 'axios'

const SearchBox = () => {
  const [search, setSearch] = React.useState('')
  const [searchAbortController, setSearchAbortController] = React.useState(new AbortController())
  const dispatch = useDispatch()

  return (<EuiFieldSearch 
    fullWidth
    key="search"
    value={search} 
    onChange={e => {
      setSearch(e.target.value)
      onSearchChange(dispatch, searchAbortController, setSearchAbortController)(e.target.value)
    }} 
    incremental
  />)
}

const onSearchChange = (dispatch, searchAbortController, setSearchAbortController) => async (newSearch) => {
  searchAbortController.abort()
  const newSearchAbortController = new AbortController()
  setSearchAbortController(newSearchAbortController)
  const response = await axios.get(`/api/events?q=${encodeURIComponent(newSearch)}`, {
    signal: newSearchAbortController.signal
  })
  dispatch(setAllEvents(response.data))
}

export default SearchBox;