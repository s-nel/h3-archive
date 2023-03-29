import { EuiBasicTable, EuiButton, EuiCard, EuiFlexGroup, EuiFlexItem, EuiHeader, EuiHorizontalRule, EuiImage, EuiPageHeader, EuiSkeletonRectangle, EuiSpacer, EuiText, EuiTextArea, EuiTitle, EuiToolTip, useIsWithinBreakpoints } from '@elastic/eui'
import React from 'react'
import axios from 'axios'
import { useSelector } from 'react-redux'
import { BsPerson } from 'react-icons/bs'
import { Link } from 'react-router-dom'

const Steamies = ({isEditing}) => {
  const [steamyDoc, setSteamyDoc] = React.useState('')
  const steamies = useSelector(state => state.steamies.value)
  const people = useSelector(state => state.people.value)
  const isMobile = useIsWithinBreakpoints(['xs', 's'])

  const orgByYear = steamies && steamies.reduce((a, b) => {
    if (a[b.year]) {
      a[`${b.year}`] = [...a[`${b.year}`], b]
    } else {
      a[`${b.year}`] = [b]
    }
    return a
  }, {})

  const editingControls = (<div>
    <EuiHorizontalRule/>
    <pre>
      <textarea cols={120} rows={30} value={steamyDoc} onChange={e => setSteamyDoc(e.target.value)} />
    </pre>
    <EuiButton onClick={() => onCreateSteamy(JSON.parse(steamyDoc))}>Create</EuiButton>
  </div>)

  const steamiesColumns = [
    {
      render: nominee => {
        console.log(nominee)
        const personIcon = person => {
          try {
            if (!person || !person.thumb) {
              return (<BsPerson style={{ width: "32px", height: "32px" }} />)
            }
            return (<EuiImage alt={person.display_name || `${person.first_name} ${person.last_name}`} width={32} height={32} src={person.thumb} />)
          } catch (err) {
            console.error(err)
          }
        }
        return nominee && nominee.people && (<EuiFlexGroup gutterSize="xs" responsive={false}>
          {nominee.people.map(person => (<EuiFlexItem grow={false} key={person.person_id} style={{width: '32px', height: '32px'}}>
            <EuiToolTip position="bottom" content={person.display_name || `${person.first_name} ${person.last_name}`}>
              <Link to={`/people/${person.person_id}`}>{personIcon(person)}</Link>
            </EuiToolTip>
          </EuiFlexItem>))}
        </EuiFlexGroup>)
      },
    },
    {
      render: nominee => {
        if (!nominee) {
          return null
        }
        if (nominee.name) {
          return <EuiText>{nominee.name}</EuiText>
        }
        return (<div>
          {nominee.people && nominee.people.map(person => <Link to={`/people/${person.person_id}`}>{person.display_name || `${person.first_name} ${person.last_name}`}</Link>).reduce((a, b) => (<span>{a}, {b}</span>))}
        </div>)
      }
    },
    {
      render: nominee => {
        if (!nominee) {
          return null
        }
        if (!nominee.won) {
          return <EuiText color="subdued">Nominated</EuiText>
        }

        return <EuiText><b>&#127942;&nbsp;Won</b></EuiText>
      },
      width: "120"
    },
  ]

  return (<div>
    <EuiPageHeader pageTitle="Steamies" />
    <EuiSpacer size={isMobile ? "m" : "xl"} />
    {
      orgByYear && Object.keys(orgByYear).map(year => {
        const yearSteamies = orgByYear[year]

        return (<div key={year}>
          <EuiTitle size="s"><h3>{year}</h3></EuiTitle>
          <EuiSpacer size={isMobile ? "s" : "m"} />
          <EuiFlexGroup 
            responsive 
            justifyContent={isMobile ? 'spaceEvenly' : undefined} 
            alignItems="flexStart"
            wrap
          >
            {yearSteamies.map(yearSteamy => {
              const steamyNominees = yearSteamy && yearSteamy.people.map(nominee => {
                const ps = people && nominee.person_id.map(p => people.find(p2 => p === p2.person_id)).filter(p => !!p)
                return people && {
                  people: ps && ps.length > 0 ? ps : undefined,
                  won: nominee.won,
                  name: nominee.name,
                }
              })

              // const steamyPeople = yearSteamy.people.map(p => {
              //   const person = people && people.find(p2 => p2.person_id === p.person_id)
              //   return person && {
              //     ...person,
              //     won: p.won,
              //   }
              // }).filter(p => !!p).sort((a, b) => {
              //   const aName = a.display_name || `${a.first_name} ${a.last_name}`
              //   const bName = b.display_name || `${b.first_name} ${b.last_name}`
              //   return aName.localeCompare(bName)
              // })

              return (<EuiFlexItem 
                key={yearSteamy.steamy_id} 
                grow={false}
                style={{ width: '400px' }}
              >
                <EuiCard title={yearSteamy.name}>
                  <EuiBasicTable 
                    tableLayout="auto"
                    loading={!steamyNominees || steamyNominees.length === 0 || !people}
                    responsive={false}
                    columns={steamiesColumns}
                    items={(people && steamyNominees) || []}
                    noItemsMessage=""
                  />
                </EuiCard>
              </EuiFlexItem>)
            })}
          </EuiFlexGroup>
        </div>)
      }).reduce((a, b) => (<div>{a}<EuiHorizontalRule/>{b}</div>))
    }
    {isEditing && editingControls}
  </div>)
}

const onCreateSteamy = async steamyDoc => {
  await axios.put(`/api/steamies/${steamyDoc.steamy_id}`, steamyDoc)
}

export default Steamies
