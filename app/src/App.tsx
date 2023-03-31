import React from 'react'
import {
  createBrowserRouter,
  Link,
  Navigate,
  Outlet,
  RouterProvider,
  useLocation,
  useNavigate,
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
  EuiHeaderSectionItemButton,
  EuiIcon,
  EuiImage,
  EuiKeyPadMenu,
  EuiKeyPadMenuItem,
  EuiLink,
  EuiPageTemplate,
  EuiPopover,
  EuiProvider,
  EuiSideNav,
  EuiText,
  useGeneratedHtmlId,
  useIsWithinBreakpoints,
} from '@elastic/eui';
import '@elastic/eui/dist/eui_theme_dark.css';
import { 
  BsCalendar3,
  BsGithub, 
  BsPeople,
  BsSoundwave,
  BsTrophy,
} from 'react-icons/bs'
import { Provider } from 'react-redux'
import store from './data/store'
import Timeline from './Timeline'
import People from './People'
import Person from './Person'
import Soundbites from './Soundbites'
import Steamies from './Steamies'
import Event from './Event'
import { setAll as setAllEvents } from './data/eventsSlice'
import { setAll as setAllPeople } from './data/peopleSlice'
import { setAll as setAllSoundbites } from './data/soundbitesSlice'
import { setAll as setAllSteamies } from './data/steamiesSlice'
import { remove as removeToast } from './data/toastsSlice'
import Login from './Login'
import ScrollToTop from './ScrollToTop';

const Root = () => {
  const [hasFetchedData, setFetchedData] = React.useState(false)
  const dispatch = useDispatch()
  const loc = useLocation()

  React.useEffect(() => {
    if (!hasFetchedData) {
      setFetchedData(true)
      getEvents(dispatch)
      getPeople(dispatch)
      getSoundbites(dispatch)
      getSteamies(dispatch)
    }
  }, [dispatch, hasFetchedData, setFetchedData])

  if (loc.pathname.match('/.*/$')) {
    return <Navigate replace to={{
        pathname: loc.pathname.replace(/\/+$/, ""),
        search: loc.search
    }}/>
  }

  const themeOverrides = {
    "colors": {
      "DARK": {
        "accent": "#7ed9f8",
        "primary": "#d06dfe"
      }
    }
  }

  return (<EuiProvider colorMode="dark" modify={themeOverrides}>
    <ScrollToTop />
    <WithProvider />
  </EuiProvider>)
}

const WithProvider = () => {
  const isMobile = useIsWithinBreakpoints(['xs', 's'])
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false)
  const toasts = useSelector(state => state.toasts.value.toasts)
  const loc = useLocation()
  const people = useSelector(state => state.people.value)
  const params = useParams()

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
    {
      name: 'Lore',
      id: 'lore',
      items: [
        {
          name: 'Soundbites',
          id: 'soundbites',
          href: '/soundbites',
          isSelected: loc.pathname === '/soundbites'
        },
        {
          name: 'Steamies',
          id: 'steamies',
          href: '/steamies',
          isSelected: loc.pathname === '/steamies'
        }
      ]
    },
  ]

  return (<EuiFlexGroup direction="column">
    <EuiFlexItem grow={1}>
      <EuiHeader position="fixed">
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
        {isMobile && (<EuiHeaderSection side="right">
          <EuiHeaderSectionItem>
            <HeaderAppMenu />
          </EuiHeaderSectionItem>
        </EuiHeaderSection>)}
      </EuiHeader>
      <EuiPageTemplate
        panelled
        grow
        restrictWidth={false}
        style={{ background: "none" }}
        mainProps={{ style: { backgroundColor: "rgba(29, 30, 36, .8)" } }}
        paddingSize="xl"
      >
        {!isMobile && (<EuiPageTemplate.Sidebar>
          <EuiSideNav 
            isOpenOnMobile={mobileNavOpen}
            toggleOpenOnMobile={() => {
              setMobileNavOpen(!mobileNavOpen)
            }}
            style={{position: "fixed"}}
            items={navItems} 
            mobileTitle="Navigate"
            renderItem={props => <Link to={props.href} {...props} key={props.href} />} 
          />
        </EuiPageTemplate.Sidebar>)}
        {/*<EuiPageTemplate.Header 
          iconType="/logo.svg" 
          pageTitle=" " 
          iconProps={{
            size: "original"
          }}
        />*/}
        <EuiPageTemplate.Section paddingSize={isMobile ? "s" : undefined} grow={true} style={{ background: "none" }}>
          <Outlet />
        </EuiPageTemplate.Section>
      </EuiPageTemplate>
      <EuiGlobalToastList
        toasts={toasts}
        dismissToast={toast => dispatch(removeToast(toast.id))}
        toastLifeTimeMs={6000}
      />
    </EuiFlexItem>
    <EuiFlexItem grow={false}>
      <EuiHeader style={{boxShadow: "0px 0 10px rgba(0, 0, 0, 0.8)"}}>
        <EuiHeaderSection grow side="right">
          <EuiHeaderSectionItem style={{width: "100%", paddingRight: "20px"}}>
            <EuiFlexGroup gutterSize="s" alignItems="center" justifyContent="flexEnd" responsive={false}>
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
          path: "/events/:eventId",
          element: <Event />
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
          path: "/steamies",
          element: <Steamies isEditing={isEditing} />,
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

async function getPeople(dispatch) {
  const response = await axios.get('/api/people')
  dispatch(setAllPeople(response.data))
}

async function getEvents(dispatch) {
  const response = await axios.get('/api/events')
  dispatch(setAllEvents(response.data))
}

async function getSoundbites(dispatch) {
  const response = await axios.get('/api/soundbites')
  dispatch(setAllSoundbites(response.data))
}

async function getSteamies(dispatch) {
  const response = await axios.get('/api/steamies')
  dispatch(setAllSteamies(response.data))
}

const HeaderAppMenu = () => {
  const headerAppPopoverId = useGeneratedHtmlId({ prefix: 'headerAppPopover' })
  const headerAppKeyPadMenuId = useGeneratedHtmlId({
    prefix: 'headerAppKeyPadMenu',
  })
  const navigate = useNavigate()

  const [isOpen, setIsOpen] = React.useState(false)

  const onMenuButtonClick = () => {
    setIsOpen(!isOpen)
  }

  const closeMenu = () => {
    setIsOpen(false)
  }

  const button = (
    <EuiHeaderSectionItemButton
      aria-controls={headerAppKeyPadMenuId}
      aria-expanded={isOpen}
      aria-haspopup="true"
      onClick={onMenuButtonClick}
    >
      <EuiIcon type="menu" size="m" />
    </EuiHeaderSectionItemButton>
  )

  return (
    <EuiPopover
      id={headerAppPopoverId}
      button={button}
      isOpen={isOpen}
      anchorPosition="downRight"
      closePopover={closeMenu}
    >
      <EuiKeyPadMenu id={headerAppKeyPadMenuId} style={{ width: "288" }}>
        <EuiKeyPadMenuItem label="People" onClick={() => {
          navigate("/people")
        }}>
          <BsPeople size="50" />
        </EuiKeyPadMenuItem>

        <EuiKeyPadMenuItem label="Timeline" onClick={() => {
          navigate("/")
        }}>
          <BsCalendar3 size="50" />
        </EuiKeyPadMenuItem>

        <EuiKeyPadMenuItem label="Soundbites" onClick={() => {
          navigate("/soundbites")
        }}>
          <BsSoundwave size="50" />
        </EuiKeyPadMenuItem>

        <EuiKeyPadMenuItem label="Steamies" onClick={() => {
          navigate("/steamies")
        }}>
          <BsTrophy size="50" />
        </EuiKeyPadMenuItem>
      </EuiKeyPadMenu>
    </EuiPopover>
  )
}

export default App
