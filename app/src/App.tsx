import React from 'react'
import {
  createBrowserRouter,
  Link,
  Navigate,
  Outlet,
  RouterProvider,
  useLocation,
  useParams,
} from "react-router-dom";
import { useDispatch, useSelector } from 'react-redux'
import Cookies from 'js-cookie'
import './App.css';
import axios from 'axios'
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiGlobalToastList,
  EuiHeader,
  EuiHeaderSection,
  EuiHeaderSectionItem,
  EuiImage,
  EuiLink,
  EuiPageTemplate,
  EuiProvider,
  EuiSideNav,
  EuiText,
} from '@elastic/eui';
import '@elastic/eui/dist/eui_theme_dark.css';
import { BsGithub } from 'react-icons/bs'
import { Provider } from 'react-redux'
import store from './data/store'
import Timeline from './Timeline'
import People from './People'
import Person from './Person'
import Soundbites from './Soundbites'
import { setAll as setAllEvents } from './data/eventsSlice'
import { setAll as setAllPeople } from './data/peopleSlice'
import { setAll as setAllSoundbites } from './data/soundbitesSlice'
import { remove as removeToast } from './data/toastsSlice'
import Login from './Login'

const Root = () => {
  const [hasFetchedData, setFetchedData] = React.useState(false)
  const dispatch = useDispatch()
  const toasts = useSelector(state => state.toasts.value.toasts)
  const people = useSelector(state => state.people.value)
  const loc = useLocation()
  const params = useParams()

  React.useEffect(() => {
    if (!hasFetchedData) {
      setFetchedData(true)
      getEvents(dispatch)
      getSoundbites(dispatch)
    }
  }, [dispatch, hasFetchedData, setFetchedData])

  if (loc.pathname.match('/.*/$')) {
    return <Navigate replace to={{
        pathname: loc.pathname.replace(/\/+$/, ""),
        search: loc.search
    }}/>
  }

  const personItems = () => {
    if (loc.pathname.startsWith('/people') && params.person) {
      const person = people && people.find(p => p.person_id === params.person)
      if (person) {
        return [
          {
            name: person.display_name || `${person.first_name} ${person.last_name}`,
            id: params.person,
            isSelected: true
          }
        ]
      }
      return undefined
    }
    return undefined
  }

  const navItems = [
    {
      name: 'Timeline',
      id: 'timeline',
      href: '/',
      isSelected: loc.pathname === '/',
    },
    {
      name: 'People',
      id: 'people',
      href: '/people',
      isSelected: loc.pathname === '/people',
      items: personItems(),
    },
    // {
    //   name: 'Lore',
    //   id: 'lore',
    //   href: '/lore',
    //   isSelected: loc.pathname === '/lore',
    // },
    {
      name: 'Soundbites',
      id: 'soundbites',
      href: '/soundbites',
      isSelected: loc.pathname === '/soundbites'
    }
  ]

  const themeOverrides = {
    "colors": {
      "DARK": {
        "accent": "#7ed9f8",
        "primary": "#d06dfe"
      }
    }
  }

  return (<EuiFlexGroup direction="column">
    <EuiFlexItem grow={1}>
      <EuiProvider colorMode="dark" modify={themeOverrides}>
        <EuiHeader>
          <EuiHeaderSection>
            <EuiHeaderSectionItem>
              <Link to="/">
                <EuiImage
                  height={20}
                  style={{ marginLeft: "20px" }}
                  alt="logo"
                  src="/logo.svg"
                />
              </Link>
            </EuiHeaderSectionItem>
          </EuiHeaderSection>
        </EuiHeader>
        <EuiPageTemplate
          panelled
          grow
          restrictWidth={false}
          style={{ background: "none" }}
          mainProps={{ style: { backgroundColor: "rgba(29, 30, 36, .8)" } }}
          paddingSize="xl"
        >
          <EuiPageTemplate.Sidebar>
            <EuiSideNav 
            style={{position: "fixed"}}
              items={navItems} 
              mobileTitle="Navigate"
              renderItem={props => <Link to={props.href} {...props} key={props.href} />} 
            />
          </EuiPageTemplate.Sidebar>
          {/*<EuiPageTemplate.Header 
            iconType="/logo.svg" 
            pageTitle=" " 
            iconProps={{
              size: "original"
            }}
          />*/}
          <EuiPageTemplate.Section grow={true} style={{ background: "none" }}>
            <Outlet />
          </EuiPageTemplate.Section>
        </EuiPageTemplate>
        <EuiGlobalToastList
          toasts={toasts}
          dismissToast={toast => dispatch(removeToast(toast.id))}
          toastLifeTimeMs={6000}
        />
      </EuiProvider>
    </EuiFlexItem>
    <EuiFlexItem grow={false}>
      <EuiHeader style={{boxShadow: "0px 0 10px rgba(0, 0, 0, 0.8)"}}>
        <EuiHeaderSection grow side="right">
          <EuiHeaderSectionItem style={{width: "100%", paddingRight: "20px"}}>
            <EuiFlexGroup gutterSize="s" alignItems="center" justifyContent="flexEnd">
              <EuiFlexItem grow={false}>
                <EuiText>
                  <EuiLink color="subtle" external={false} target="_blank" href="https://github.com/s-nel/h3-archive/blob/main/CONTRIBUTORS.md">Made with love</EuiLink>
                </EuiText>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiLink color="subtle" external={false} target="_blank" href="https://github.com/s-nel/h3-archive">
                  <BsGithub style={{width: "24px", height: "24px"}} />
                </EuiLink>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiHeaderSectionItem>
        </EuiHeaderSection>
      </EuiHeader>
    </EuiFlexItem>
  </EuiFlexGroup>)
}

const App = () => {

  const [isEditing] = React.useState(!!Cookies.get('session'))

  const router = createBrowserRouter([
    {
      path: "/",
      element: <Root />,
      children: [
        {
          index: true,
          element: <Timeline isEditing={isEditing} />,
        },
        {
          path: "/people",
          element: <People isEditing={isEditing} />,
        },
        {
          path: "/people/:person",
          element: <Person isEditing={isEditing} />,
        },
        // {
        //   path: "/lore",
        //   element: <Lore />,
        // },
        {
          path: "/soundbites",
          element: <Soundbites />,
        },
        {
          path: "/login",
          element: <Login />
        }
      ],
    },
  ])

  return (<Provider store={store}><RouterProvider router={router} /></Provider>);
}

async function getPeople(dispatch, events) {
  const response = await axios.get('/api/people')
  const withEventCounts = response.data.map(person => {
    const eventCount = events.reduce((acc, e) => {
      if (e.people.find(p => p.person_id === person.person_id)) {
        return acc + 1
      } else {
        return acc
      }
    }, 0)
    person.event_count = eventCount
    return person
  })
  const sorted = withEventCounts.sort((a, b) => {
    const diff = b.event_count - a.event_count
    if (diff !== 0) {
      return diff
    }
    const aName = a.display_name || `${a.first_name} ${a.last_name}`
    const bName = b.display_name || `${b.first_name} ${b.last_name}`
    return aName.localeCompare(bName)
  })
  dispatch(setAllPeople(sorted))
}

async function getEvents(dispatch) {
  const response = await axios.get('/api/events')
  getPeople(dispatch, response.data)
  dispatch(setAllEvents(response.data))
}

async function getSoundbites(dispatch) {
  const response = await axios.get('/api/soundbites')
  dispatch(setAllSoundbites(response.data))
}

export default App
