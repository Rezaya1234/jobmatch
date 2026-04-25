import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

// Sign up is the same as the profile setup flow
export default function SignUp() {
  const navigate = useNavigate()
  useEffect(() => { navigate('/profile', { replace: true }) }, [navigate])
  return null
}
