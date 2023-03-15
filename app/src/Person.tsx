import React from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  EuiBasicTable,
  EuiBreadcrumb,
  EuiBreadcrumbs,
  EuiButton,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHorizontalRule,
  EuiImage,
  EuiPageHeader,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTextColor,
} from '@elastic/eui'
import { useDispatch, useSelector } from 'react-redux'
import axios from 'axios'
import { add as addToast } from './data/toastsSlice'

const Person = ({
  isEditing,
}) => {
  const [personDoc, setPersonDoc] = React.useState('')
  const personId = useParams().person
  const people = useSelector(state => state.people.value)
  const soundbites = useSelector(state => state.soundbites.value && state.soundbites.value.filter(s => s.person_id === personId))
  const navigate = useNavigate()
  const dispatch = useDispatch()

  const person = people && people.find(p => p.person_id === personId)

  React.useEffect(() => {
    if (!personDoc && person) {
      const personMinusOtherFields = Object.assign({}, person)
      personMinusOtherFields.event_count = undefined
      setPersonDoc(JSON.stringify(personMinusOtherFields, null, '    '))
    }
  }, [personDoc, setPersonDoc, person])

  if (!person) {
    return null
  }

  const isDisplayNameDifferent = person.display_name && person.display_name !== `${person.first_name} ${person.last_name}`

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

  const soundbitesColumns = [
    {
      render: soundbite => soundbite.quote ? `“${soundbite.quote}”` : soundbite.alt,
    },
    {
      width: 50,
      actions: [
        {
          name: 'Play',
          type: 'icon',
          icon: 'play',
          onClick: soundbite => {
            new Audio(soundbite.sound_file).play()
          }
        }
      ]
    }
  ]

  const editingControls = (<div>
    <EuiHorizontalRule/>
    <pre>
      <textarea cols={120} rows={30} value={personDoc} onChange={e => setPersonDoc(e.target.value)} />
    </pre>
    <EuiButton onClick={() => onCreatePerson(JSON.parse(personDoc), dispatch)}>Create</EuiButton>
  </div>)

  return (<div>
    <EuiBreadcrumbs breadcrumbs={breadcrumbs} />
    <EuiSpacer size="m" />
    <EuiFlexGroup>
      <EuiFlexItem grow={3}>
        <EuiFlexGroup direction="column">
          <EuiFlexItem grow={false}>
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
          </EuiFlexItem>
          {person.description && <EuiFlexItem grow>
            <EuiText>{person.description}</EuiText>
          </EuiFlexItem>}
        </EuiFlexGroup>
      </EuiFlexItem>
      {soundbites && soundbites.length > 0 && (<EuiFlexItem grow={1}>
        <EuiFlexGroup direction="column">
          <EuiPanel grow={false}>
            <EuiText>
              <h4>Soundbites</h4>
            </EuiText>
            <EuiBasicTable items={soundbites} columns={soundbitesColumns} />
          </EuiPanel>
        </EuiFlexGroup>
      </EuiFlexItem>)}
    </EuiFlexGroup>
    <EuiSpacer size="xl" />
    {isEditing && editingControls}
  </div>)
}

async function onCreatePerson(personDoc, dispatch) {
  await axios.put(`/api/people/${personDoc.person_id}`, personDoc)
  dispatch(

  )
  // dispatch(addToast({
  //   color: 'success',
  //   title: 'Added used',
  // }))
}

export default Person