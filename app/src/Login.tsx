import React from 'react'
import {
  EuiButton,
  EuiFieldPassword,
  EuiFieldText,
  EuiSpacer,
  EuiTitle
} from '@elastic/eui'
import axios from 'axios'

const Login = () => {
  const [user, setUser] = React.useState('')
  const [password, setPassword] = React.useState('')

  return (<div>
    <EuiTitle>
      <h1>Login</h1>
    </EuiTitle>
    <EuiSpacer size="xl" />
    <form>
      <EuiFieldText value={user} placeholder="Username" onChange={e => {
        setUser(e.target.value)
      }} />
      <EuiSpacer size="m" />
      <EuiFieldPassword value={password} placeholder="Password" onChange={e => {
        setPassword(e.target.value)
      }} />
      <EuiSpacer size="m" />
      <EuiButton onClick={() => {
        axios.post('/api/auth/_login', {
          user,
          password,
        })
      }}>Login</EuiButton>
    </form>
  </div>)
}

export default Login