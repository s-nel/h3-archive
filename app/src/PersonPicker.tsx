import { EuiImage, EuiSuggest } from '@elastic/eui'
import React from 'react'

const PersonPicker = ({
  person,
  onPersonPicked,
  people,
}: {
  person: string | undefined,
  onPersonPicked: (string) => void,
  people: [{
    id: string,
    displayName: string,
    thumb: string | undefined,
  }]
}) => {
  return <EuiSuggest
    onChange={v => {onPersonPicked(v)}}
    value={person}
    isVirtualized
    suggestions={people ? people.map(p => {
      const Icon = (thumb: string) => () => {
        return <EuiImage style={{width: '16px', height: '16px',}} src={thumb} alt={`${p.displayName} photo`} />
      }
      return {
        type: {
          iconType: p.thumb ? Icon(p.thumb) : 'user'
        },
        label: p.displayName,
        onClick: () => { onPersonPicked(p.id) },
        className: 'suggestItem'
      }
    }): []}
  />
}

export default PersonPicker