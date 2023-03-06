import React from 'react'
import {
  EuiBadge,
  EuiButton,
  EuiCard,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHorizontalRule,
  EuiIcon,
  EuiText,
} from '@elastic/eui'
import axios from 'axios'
import { useSelector } from 'react-redux'

const People = ({
  isEditing,
  addToast,
}) => {
  const [personDoc, setPersonDoc] = React.useState('')
  const people = useSelector((state) => state.people.value)

  if (!people) {
    return null
  }

  const categoryLabel = {
    creator: 'Creator',
    crew: 'Crew',
    guest: 'Guest',
    enemy: 'Enemy',
    friend: 'Friend',
  }

  const editingControls = (<div>
    <EuiHorizontalRule/>
    <pre>
      <textarea cols={120} rows={30} value={personDoc} onChange={e => setPersonDoc(e.target.value)} />
    </pre>
    <EuiButton onClick={() => onCreatePerson(JSON.parse(personDoc), addToast)}>Create</EuiButton>
  </div>)

  return (<div>
    <EuiFlexGroup wrap>
      {people && people.map((p, i) => {
        const imgWidth = i < 10 ? "200px" : "150px"
        const missingImg = (<EuiFlexGroup 
          alignItems="center" 
          justifyContent="center" 
          style={{width: imgWidth, height: imgWidth}}
        >
          <EuiFlexItem grow={false}>
            <EuiIcon size="xxl" type="user" />
          </EuiFlexItem>
        </EuiFlexGroup>)
        return (<EuiFlexItem key={p.person_id} grow={false}>
          <EuiCard
            title={(<EuiText style={{textOverflow: 'ellipsis', overflow: 'hidden', fontWeight: 'bold', whiteSpace: 'nowrap'}}>{`${p.first_name} ${p.last_name}`}</EuiText>)}
            textAlign="left"
            style={{width: imgWidth}}
            titleSize="xs"
            grow={false}
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
            </div>)}
          />
        </EuiFlexItem>)
      })}
    </EuiFlexGroup>
    {isEditing && editingControls}
  </div>)
}

async function onCreatePerson(personDoc, addToast) {
  await axios.post('/api/people', personDoc)
}

export default People