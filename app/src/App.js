import React from 'react'
import {
  createBrowserRouter,
  Link,
  Outlet,
  RouterProvider,
  useLocation,
} from "react-router-dom";
import { useDispatch, useSelector } from 'react-redux'
import './App.css';
import axios from 'axios'
import {
  EuiGlobalToastList,
  EuiHeader,
  EuiPageTemplate,
  EuiProvider,
  EuiSideNav,
} from '@elastic/eui';
import '@elastic/eui/dist/eui_theme_dark.css';
import { Provider } from 'react-redux'
import store from './data/store'
import Timeline from './Timeline'
import People from './People'
import { setAll as setAllEvents } from './data/eventsSlice'
import { setAll as setAllPeople } from './data/peopleSlice'
import { remove as removeToast } from './data/toastsSlice'

const Root = () => {
  const [hasFetchedData, setFetchedData] = React.useState(false)
  const dispatch = useDispatch()
  const toasts = useSelector(state => state.toasts.value)
  const loc = useLocation()

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
    }
  ]

  React.useEffect(() => {
    if (!hasFetchedData) {
      setFetchedData(true)
      getEvents(dispatch)
    }
  }, [dispatch, hasFetchedData, setFetchedData])

  const themeOverrides = {
    "colors": {
      "DARK": {
        "accent": "#7ed9f8",
        "primary": "#d06dfe"
      }
    }
  }

  return (<EuiProvider colorMode="dark" modify={themeOverrides}>
    <EuiHeader
    
    >
      <EuiPageTemplate 
        panelled 
        grow 
        restrictWidth={false} 
        style={{ background: "none" }} 
        mainProps={{ style: { backgroundColor: "rgba(29, 30, 36, .8)" } }}
        paddingSize="xl"
      >
        <EuiPageTemplate.Sidebar>
          <EuiSideNav items={navItems} renderItem={props => <Link to={props.href} {...props} />} />
        </EuiPageTemplate.Sidebar>
        <EuiPageTemplate.Header 
          iconType="/logo.svg" 
          pageTitle=" " 
          iconProps={{
            size: "original"
          }}
        />
        <EuiPageTemplate.Section grow={true} style={{ background: "none" }}>
          <Outlet/>
        </EuiPageTemplate.Section>
      </EuiPageTemplate>
      <EuiGlobalToastList
        toasts={toasts}
        dismissToast={toast => dispatch(removeToast(toast.id))}
        toastLifeTimeMs={6000}
      />
    </EuiHeader>
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
  const sorted = withEventCounts.sort((a, b) => b.event_count - a.event_count)
  dispatch(setAllPeople(sorted))
}

async function getEvents(dispatch) {
  const response = await axios.get('/api/events')
  getPeople(dispatch, response.data)
  dispatch(setAllEvents(response.data))
}

export default App;
