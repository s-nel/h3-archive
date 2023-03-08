import React from 'react'
import Chart from './Chart'
import Info from './Info'
import './App.css'
import SearchBox from './SearchBox'

const Timeline = ({
  isEditing,
}) => {
  const [info, setInfo] = React.useState()

  return (<div>
    <SearchBox />
    <Chart setInfo={setInfo} info={info} />
    <Info info={info} isEditing={isEditing} setInfo={setInfo} />
  </div>)
}

export default Timeline