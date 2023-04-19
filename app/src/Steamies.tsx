import { EuiBasicTable, EuiButton, EuiButtonIcon, EuiCard, EuiFlexGroup, EuiFlexItem, EuiHeader, EuiHorizontalRule, EuiImage, EuiPageHeader, EuiSkeletonRectangle, EuiSkeletonText, EuiSkeletonTitle, EuiSpacer, EuiText, EuiTextArea, EuiTitle, EuiToolTip, useIsWithinBreakpoints } from '@elastic/eui'
import React from 'react'
import axios from 'axios'
import { useSelector } from 'react-redux'
import { BsPerson } from 'react-icons/bs'
import { Link } from 'react-router-dom'
import { setTitle } from './util'

const Steamies = ({isEditing}) => {
  const [steamyDoc, setSteamyDoc] = React.useState('')
  const steamies = useSelector(state => state.steamies.value)
  const people = useSelector(state => state.people.value)
  const isMobile = useIsWithinBreakpoints(['xs', 's'])

  React.useEffect(() => {
    setTitle('Steamies')
  }, [steamies && steamies.length])

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
      name: 'Nominee',
      render: nominee => {
        const personIcon = person => {
          try {
            if (!person.display_name && !person.first_name) {
              return <EuiSkeletonRectangle borderRadius="none" width={32} height={32} />
            }
            if (!person.thumb) {
              return (<BsPerson style={{ width: "32px", height: "32px" }} />)
            }
            return (<EuiImage alt={person.display_name || `${person.first_name} ${person.last_name}`} width={32} height={32} src={person.thumb} />)
          } catch (err) {
            console.error(err)
          }
        }
        return nominee && nominee.people && (<EuiFlexGroup gutterSize="xs" responsive={false}>
          {nominee.people.map(person => (<EuiFlexItem grow={false} key={person.person_id} style={{width: '32px', height: '32px'}}>
            {(person.display_name || person.first_name) && <EuiToolTip position="bottom" content={person.display_name || `${person.first_name} ${person.last_name}`}>
              <Link to={`/people/${person.person_id}`}>{personIcon(person)}</Link>
            </EuiToolTip>}
            {!(person.display_name || person.first_name) && personIcon(person)}
          </EuiFlexItem>))}
        </EuiFlexGroup>)
      },
      mobileOptions: {
        width: '100%',
      }
    },
    {
      render: nominee => {
        if (!nominee) {
          return null
        }
        if (nominee.name) {
          return <div><EuiText>{nominee.name}</EuiText></div>
        }
        if (nominee.people.length === 0) {
          return null
        }
        if (nominee.people.every(p => !p.display_name && !p.first_name)) {
          return <div><EuiSkeletonTitle style={{width: "100px"}} size="xs" /></div>
        }
        return (<div>
          {nominee.people && nominee.people.length > 0 && nominee.people.map(person => <Link key={person.person_id} to={`/people/${person.person_id}`}>{person.display_name || `${person.first_name} ${person.last_name}`}</Link>).reduce((a, b) => (<span>{a}, {b}</span>))}
        </div>)
      },
      mobileOptions: {
        width: '100%',
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
      width: "100"
    },
  ]

  const steamyWidth = '500px'

  return (<div>
    <EuiPageHeader pageTitle="Steamies" />
    <EuiSpacer size={isMobile ? "m" : "xl"} />
    {
      orgByYear && Object.keys(orgByYear).sort((a, b) => parseInt(b) -  parseInt(a)).map(year => {
        const yearSteamies = orgByYear[year]

        return (<div key={year}>
          <EuiTitle size="m"><h2>{year}</h2></EuiTitle>
          <EuiSpacer size={isMobile ? "s" : "m"} />
          <EuiFlexGroup 
            responsive 
            justifyContent={isMobile ? 'spaceEvenly' : undefined} 
            alignItems="flexStart"
            wrap
          >
            {yearSteamies.sort((a, b) => a.name.localeCompare(b.name)).map(yearSteamy => {
              const steamyNominees = yearSteamy && yearSteamy.people.map(nominee => {
                const ps = nominee.person_id.map(p => people ? people.find(p2 => p === p2.person_id) : p).filter(p => !!p)
                return {
                  people: ps,
                  won: nominee.won,
                  name: nominee.name,
                }
              })

              return (<EuiFlexItem 
                key={yearSteamy.steamy_id} 
                grow={false}
                style={{ width: steamyWidth }}
              >
                <EditSteamyButton steamyId={yearSteamy.steamy_id} />
                <EuiCard paddingSize={isMobile ? 's' : undefined} title={yearSteamy.name}>
                  <EuiBasicTable
                    tableLayout="auto"
                    loading={!steamyNominees || steamyNominees.length === 0}
                    columns={steamiesColumns}
                    items={steamyNominees}
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

const EditSteamyButton = ({
  steamyId,
}) => {
  const [hovering, setHovering] = React.useState(false)
  const isMobile = useIsWithinBreakpoints(['xs', 's'])

  return (<div style={{ position: 'relative' }}>
    <div style={{ position: 'absolute', top: '0px', right: '0px', opacity: hovering || isMobile ? 1 : '.5' }} onMouseEnter={() => {setHovering(true)}} onMouseLeave={() => {setHovering(false)}}>
      <EuiToolTip content="Suggest an edit">
        <EuiButtonIcon aria-label="edit steamy" target="_blank" href={`https://github.com/s-nel/h3-archive/edit/main/content/steamies/${steamyId}.json`} iconType="pencil" display="base" />
      </EuiToolTip>
    </div>
  </div>)
}

export default Steamies
