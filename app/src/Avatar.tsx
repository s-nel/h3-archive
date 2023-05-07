import React from 'react'
import {
  EuiAvatar, EuiIcon, EuiToolTip
} from '@elastic/eui'

const Avatar = ({
  person,
  size,
}) => {
  const name = person.display_name || `${person.first_name} ${person.last_name}`

  return (<EuiToolTip content={name}>
     <EuiAvatar size={size} name={name} imageUrl={person.thumb} />
  </EuiToolTip>)
}

export default Avatar