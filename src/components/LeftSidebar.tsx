import type { BridgeSnapshot } from "#/service/bridge"
import { snapshot } from "effect/TxHashMap"
import BorderBox from "./BorderBox"
import Text from "./Text"

const collectionLabels = {
  playlists: "Playlists",
  "saved-tracks": "Saved tracks",
  "saved-albums": "Saved albums",
  "followed-artists": "Followed artists",
} as const

const collectionKeys = Object.keys(collectionLabels) as Array<
  keyof typeof collectionLabels
>

type LeftSidebarProps = {
  readonly snapshot: BridgeSnapshot
}

export default function LeftSidebar(props: LeftSidebarProps) {
  return (
    <BorderBox>
      <Text>LIBRARY</Text>
      {collectionKeys.map((collection, index) => (
        <box key={collection}>
          <text>
            {collection === snapshot.activeCollection ? ">" : " "} {index + 1}{" "}
            {collectionLabels[collection]}
          </text>
        </box>
      ))}
      <box flexGrow={1} />
    </BorderBox>
  )
}
