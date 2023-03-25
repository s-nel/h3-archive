import React from 'react'
import { height as chartHeight } from './Chart'
import Chart from './Chart'
import Info from './Info'
import './App.css'
import SearchBox from './SearchBox'
import { useSelector } from 'react-redux'
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiLoadingChart,
} from '@elastic/eui'

const Timeline = ({
  isEditing,
}) => {
  const [force, setForce] = React.useState(0)
  const events = useSelector(state => state.events.value)

  const setInfo = (info) => {
    const existingParams = new URLSearchParams(window.location.search)
    if (existingParams.get('event_id') !== info.event_id) {
      existingParams.set('event_id', info.event_id)
      const newurl = `${window.location.protocol}//${window.location.host}${window.location.pathname}?${existingParams.toString()}`
      window.history.replaceState({path:newurl},'',newurl)
      setForce(force + 1)
    }
  }
  const searchParams = new URLSearchParams(window.location.search)
  const info = events && searchParams.get('event_id') && events.find(e => e.event_id === searchParams.get('event_id'))

  if (!events) {
    return (<EuiFlexGroup
      style={{
        maxWidth: '100%',
        height: `${chartHeight}px`,
      }}
      alignItems="center"
      justifyContent="center"
    >
      <EuiFlexItem grow={false}>
        <EuiLoadingChart size="xl" />
      </EuiFlexItem>
    </EuiFlexGroup>)
  }

  return (<div>
    <SearchBox />
    <Chart setInfo={setInfo} info={info} />
    <Info info={info} isEditing={isEditing} setInfo={setInfo} />
  </div>)
}

export default Timeline