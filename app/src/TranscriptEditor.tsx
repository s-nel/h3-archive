import { EuiAvatar, EuiButton, EuiButtonIcon, EuiCheckbox, EuiFieldText, EuiFlexGroup, EuiFlexItem, EuiIcon, EuiImage, EuiLink, EuiSelect, EuiSuperSelect, EuiText, EuiToolTip } from '@elastic/eui'
import AutoSizer from 'react-virtualized-auto-sizer'
import { VariableSizeList as List } from 'react-window'
import React from 'react'
import Video from './Video'
import PersonPicker from './PersonPicker'
import { EuiImageButton } from '@elastic/eui/src/components/image/image_button'
import { current } from '@reduxjs/toolkit'

const GUTTER_SIZE = 5

const TranscriptEditor = ({
  ytId,
  segments,
  speakers,
  onSegmentsChanged,
  onSave,
}: {
  ytId: string,
  segments: [{
    text: string,
    start: number,
    end: number,
    speaker: string,
    is_soundbite: boolean,
  }],
  speakers: [{
    id: string,
    thumb: string,
    displayName: string,
  }],
  onSegmentsChanged,
  onSave,
}) => {
  const ytVideoRef = React.useRef(null)
  const [ytVideo, setYtVideo] = React.useState()
  const listRef = React.createRef()
  const rowHeights = React.useRef({})
  const [ytMonitor, setYtMonitor] = React.useState()
  const [highlightedIndex, setHighlightedIndex] = React.useState<number | undefined>()
  const [ytState, setYtState] = React.useState<number>(0)
  const [playbackSpeed, setPlaybackSpeed] = React.useState<number>(1.2)

  const sortedSpeakers = speakers && speakers.sort((s1, s2) => {
    const s1Count = segments.filter(s => s.speaker && s.speaker === s1.id).length
    const s2Count = segments.filter(s => s.speaker && s.speaker === s2.id).length

    return s2Count - s1Count
  })

  const topSpeakers = sortedSpeakers.slice(0, 10)

  React.useEffect(() => {
    if (ytMonitor) {
      window.clearInterval(ytMonitor)
    }
    if (ytVideo) {
      setYtMonitor(window.setInterval(() => {
        const currentPlayTime = ytVideo.getCurrentTime()
        const newHighlightedIndex = segments.findIndex(s => currentPlayTime && currentPlayTime >= s.start  && currentPlayTime < s.end)
        if (newHighlightedIndex !== highlightedIndex) {
          setHighlightedIndex(newHighlightedIndex)
        }
      }, 500))
      ytVideo.addEventListener('onStateChange', ({
        data,
      }) => {
        ytVideo.setPlaybackRate(playbackSpeed)
        setYtState(data)
      })
    }
  }, [ytVideo])

  console.log('rerender')

  const getRowHeight = (index) => {
    //return rowHeights.current[index] + GUTTER_SIZE || 40 + GUTTER_SIZE
    return 40 + GUTTER_SIZE
  }

  const setRowHeight = (index, size) => {
    listRef.current.resetAfterIndex(0);
    rowHeights.current = { ...rowHeights.current, [index]: size };
  }

  console.log(ytState)

  const isPlaying = ytState === 1

  const onChangePlaybackSpeed = (speed) => {
    if (ytVideo) {
      ytVideo.setPlaybackRate(speed)
      setPlaybackSpeed(speed)
    }
  }

  const togglePlay = () => {
    if (ytVideo) {
      if (isPlaying) {
        ytVideo.pauseVideo()
      } else {
        ytVideo.playVideo()
      }
    }
  }

  return (<EuiFlexGroup>
    <EuiFlexItem grow={1}>
      <EuiFlexGroup direction="column">
        <EuiFlexItem grow={false}>
          <Video ytVideoRef={ytVideoRef} ytId={ytId} onVideoReady={e => setYtVideo(e.target)} />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiFlexGroup>
            <EuiFlexItem grow={1}>
              <EuiButton iconType={isPlaying ? "pause" : "play"} onClick={togglePlay}>{isPlaying ? "Pause" : "Play"}</EuiButton>
            </EuiFlexItem>
            <EuiFlexItem grow={1}>
              <EuiButton fill={playbackSpeed === 1.0} onClick={() => onChangePlaybackSpeed(1.0)}>1x</EuiButton>
            </EuiFlexItem>
            <EuiFlexItem grow={1}>
              <EuiButton fill={playbackSpeed === 1.2} onClick={() => onChangePlaybackSpeed(1.2)}>1.2x</EuiButton>
            </EuiFlexItem>
            <EuiFlexItem grow={1}>
              <EuiButton fill={playbackSpeed === 1.5} onClick={() => onChangePlaybackSpeed(1.5)}>1.5x</EuiButton>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiFlexItem>
    <EuiFlexItem grow={3}>
      <div style={{ height: '85vh' }}>
        <AutoSizer>
          {({ height, width }) => (<List
            className="eui-yScroll"
            style={{
              background: 'none',
            }}
            ref={listRef}
            itemCount={segments.length}
            width={width}
            height={height}
            itemData={{
              segments,
              setRowHeight,
              ytVideo,
              onSave,
              speakers: sortedSpeakers,
              topSpeakers,
              onSegmentsChanged,
              highlightedIndex,
            }}
            itemSize={getRowHeight}
          >
            {Segment}
          </List>)}
        </AutoSizer>
      </div>
    </EuiFlexItem>
  </EuiFlexGroup>)
}

const Segment = ({
  style,
  index,
  data: {
    segments,
    setRowHeight,
    ytVideo,
    onSave,
    speakers,
    topSpeakers,
    onSegmentsChanged,
    highlightedIndex,
  },
}) => {
  const rowRef = React.useRef({})
  const segment = segments[index]
  const [text, setText] = React.useState(segment.text)
  const [speakerId, setSpeakerId] = React.useState<string | undefined>(segment.speaker)
  const isHighlighted = highlightedIndex === index

  React.useEffect(() => {
    if (rowRef.current) {
      setRowHeight(index, rowRef.current.clientHeight)
    }
  }, [rowRef && rowRef.current]) 

  const playSegment = () => {
    if (ytVideo) {
      ytVideo.seekTo(segment.start, true)
      ytVideo.playVideo()
    }
  }

  const onSoundbiteChecked = (checked) => {
    onSave(segments.map((s, i) => {
      if (i === index) {
        return {
          ...s,
          is_soundbite: checked,
        }
      }
      return s
    }))
  }

  return (<EuiFlexGroup 
    key={index}
    alignItems="center" 
    gutterSize="s"
    style={{        
      ...style,
      top: style.top + GUTTER_SIZE,
      height: style.height - GUTTER_SIZE,
    }}
  >
    <EuiFlexItem grow={1}>
      <form 
        onSubmit={e => { 
          e.preventDefault()
          onSave(segments.map((s, i) => {
            if (i === index) {
              return {
                ...s,
                text: text,
              }
            }
            return s
          }))
        }}
      >
        <EuiFieldText 
          onDoubleClick={playSegment}
          fullWidth 
          onClick={undefined /*currentPlayTime && currentPlayTime > segment.start && currentPlayTime <= segment.end ? undefined : playSegment*/}
          value={text} 
          onChange={e => {
            setText(e.target.value)
          }} 
          style={{
            backgroundColor: isHighlighted ? 'yellow' : undefined,
            color: isHighlighted ? 'black' : undefined
          }}
        />
      </form>
    </EuiFlexItem>
    <EuiFlexItem grow={false}>
      <Speaker 
        speakerId={segment.speaker} 
        speakers={speakers} 
        topSpeakers={topSpeakers}
        segments={segments} 
        onSetSpeaker={speaker => {
          onSave(segments.map((s, i) => {
            if (i === index) {
              return {
                ...s,
                speaker: speaker,
              }
            }
            return s
          }))
        }} 
      />
    </EuiFlexItem>
    <EuiFlexItem grow={false}>
      <EuiButtonIcon 
        aria-label="play"
        iconType="play"
        onClick={playSegment}
      />
    </EuiFlexItem>
    <EuiFlexItem grow={false}>
      <EuiButtonIcon aria-label="delete" iconType="trash" onClick={() => {onSegmentsChanged(segments.filter((s, i) => i !== index))}} />
    </EuiFlexItem>
    <EuiFlexItem grow={false}>
      <EuiCheckbox id={`seg-${index}-soundbite-check`} label="Soundbite" onChange={e => onSoundbiteChecked(e.target.checked)} checked={segment.is_soundbite} />
    </EuiFlexItem>
  </EuiFlexGroup>)
}

const Speaker = ({
  speakerId,
  speakers,
  segments,
  topSpeakers,
  onSetSpeaker,
}: {
  speakerId: string,
  speakers: [{
    id: string,
    thumb: string,
    displayName: string,
  }],
  segments: [{
    text: string,
    start: number,
    end: number,
    speaker: string,
  }],
  onSetSpeaker: (string) => void,
}) => {
  const speaker = speakers.find(s => s.id === speakerId)
  const [pickerShowing, setPickerShowing] = React.useState(false)

  const deleteSpeaker = () => {
    onSetSpeaker(null)
  }

  if (!speaker) {
    const PersonButton = ({
      speaker
    }: {
      speaker: {
        id: string,
        displayName: string,
        thumb: string | undefined,
      }
    }) => {
      return (<EuiToolTip content={speaker.displayName}>
        <EuiAvatar onClick={() => onSetSpeaker(speaker.id)} style={{ width: '24px', height: '24px' }} imageUrl={speaker.thumb} name={speaker.displayName} />
      </EuiToolTip>)
    }

    return (<EuiFlexGroup alignItems="center" gutterSize="s">
      {topSpeakers.map((s, i) => <EuiFlexItem key={`s-${i}`} grow={false}><PersonButton speaker={s} /></EuiFlexItem>)}
      <EuiFlexItem grow={false}>
        {pickerShowing && <PersonPicker people={speakers} person={speakerId} onPersonPicked={onSetSpeaker} />}
        {!pickerShowing && <EuiButtonIcon aria-label="add speaker" iconType="plus" onClick={() => setPickerShowing(true)} />}
      </EuiFlexItem>
    </EuiFlexGroup>)
  }

  return speaker.thumb ? <EuiImage onClick={deleteSpeaker} style={{ width: '24px', height: '24px', }} src={speaker.thumb} alt={`${speaker.displayName} photo`} /> : <EuiIcon onClick={deleteSpeaker} size="l" type="user" />
}

export default TranscriptEditor