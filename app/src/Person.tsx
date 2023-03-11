import React from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  EuiBreadcrumb,
  EuiBreadcrumbs,
  EuiFlexGroup,
  EuiFlexItem,
  EuiImage,
  EuiPageHeader,
  EuiSpacer,
  EuiText,
  EuiTextColor,
} from '@elastic/eui'
import { useSelector } from 'react-redux'

const Person = () => {
  const personId = useParams().person
  const people = useSelector(state => state.people.value)
  const navigate = useNavigate()

  const person = people.find(p => p.person_id === personId)

  if (!person) {
    return null
  }

  const isDisplayNameDifferent = person.display_name !== `${person.first_name} ${person.last_name}`

  const breadcrumbs: EuiBreadcrumb[] = [
    {
      text: 'People',
      onClick: () => {
        navigate('/people')
      }
    },
    {
      text: person.display_name || `${person.first_name} ${person.last_name}`,
    },
  ]

  const imgWidth = "200px"

  return (<div>
    <EuiBreadcrumbs breadcrumbs={breadcrumbs} />
    <EuiSpacer size="m" />
    <EuiFlexGroup alignItems="baseline">
      {person.thumb && (<EuiFlexItem grow={false}>
        <EuiImage style={{width: imgWidth, height: imgWidth}} alt="thumbnail" src={person.thumb} />  
      </EuiFlexItem>)}
      <EuiFlexItem grow={false}>
        <EuiPageHeader pageTitle={person.display_name || `${person.first_name} ${person.last_name}`} />
        {isDisplayNameDifferent && (<EuiText>
          <EuiTextColor color="subdued">{`${person.first_name} ${person.last_name}`}</EuiTextColor>
        </EuiText>)}
      </EuiFlexItem>
    </EuiFlexGroup>
    <EuiSpacer size="xl" />
  </div>)
}

export default Person