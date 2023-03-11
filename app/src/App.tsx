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
import './App.css';
import axios from 'axios'
import {
  EuiGlobalToastList,
  EuiHeader,
  EuiHeaderSection,
  EuiHeaderSectionItem,
  EuiImage,
  EuiPageTemplate,
  EuiProvider,
  EuiSideNav,
  EuiSideNavItem,
} from '@elastic/eui';
import '@elastic/eui/dist/eui_theme_dark.css';
import { Provider } from 'react-redux'
import store from './data/store'
import Timeline from './Timeline'
import People from './People'
import Person from './Person'
import Lore from './Lore'
import Soundbites from './Soundbites'
import { setAll as setAllEvents } from './data/eventsSlice'
import { setAll as setAllPeople } from './data/peopleSlice'
import { remove as removeToast } from './data/toastsSlice'

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
    }
  }, [dispatch, hasFetchedData, setFetchedData])

  if (loc.pathname.match('/.*/$')) {
    return <Navigate replace to={{
        pathname: loc.pathname.replace(/\/+$/, ""),
        search: loc.search
    }}/>
  }

  const personItems = (): EuiSideNavItem[] | undefined => {
    if (loc.pathname.startsWith('/people') && params.person) {
      const person = people.find(p => p.person_id === params.person)
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

  const navItems: EuiSideNavItem[] = [
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
    {
      name: 'Lore',
      id: 'lore',
      href: '/lore',
      isSelected: loc.pathname === '/lore',
    },
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

  return (<EuiProvider colorMode="dark" modify={themeOverrides}>
    <EuiHeader>
      <EuiHeaderSection>
        <EuiHeaderSectionItem>
          <EuiImage
            height={20}
            style={{ marginLeft: "20px" }}
            alt="logo"
            src="/logo.svg"
          />
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
  </EuiProvider>)
}

const App = () => {
  const [isEditing] = React.useState(true)

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
        {
          path: "/lore",
          element: <Lore />,
        },
        {
          path: "/soundbites",
          element: <Soundbites />,
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

export default App
