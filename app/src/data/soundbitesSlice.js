import { createSlice } from '@reduxjs/toolkit'

export const soundbitesSlice = createSlice({
  name: 'soundbites',
  initialState: {
    value: undefined,
  },
  reducers: {
    setAll: (state, action) => {
      state.value = action.payload
    },
  },
})

// Action creators are generated for each case reducer function
export const { set, setAll } = soundbitesSlice.actions

export default soundbitesSlice.reducer