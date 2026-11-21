import type { ComponentType } from 'react'
import type { ProjectId } from '../../data/projects'
import EkatraVisual from './EkatraVisual'
import AnkVisual from './AnkVisual'
import ShodhVisual from './ShodhVisual'
import SetuVisual from './SetuVisual'
import RailVisual from './RailVisual'
import KavachVisual from './KavachVisual'
import SwarVisual from './SwarVisual'

export const VISUALS: Record<ProjectId, ComponentType<{ active: boolean }>> = {
  ekatra: EkatraVisual,
  ank: AnkVisual,
  shodh: ShodhVisual,
  setu: SetuVisual,
  rail: RailVisual,
  kavach: KavachVisual,
  swar: SwarVisual,
}
