/*
 * Module code goes here. Use 'module.exports' to export things:
 * module.exports.thing = 'a thing';
 *
 * You can import it from another modules like this:
 * var mod = require('guard');
 * mod.thing == 'a thing'; // true
 */

require('CreepFactory');
//var PriorityQueue = require('pqueue');
var utils = require('utils');
var strerror = utils.strerror;
//var cat = utils.cat;

Spawn.prototype.makeGuard = function (init) {
	//init = init || {};
	var mem = {};
	mem.run = 'startGuard';
	mem.genesis = 'makeGuard';
	mem.ignoreKeepers = init.ignoreKeepers;
	mem.room = init.room || this.room.name;

	var body = [MOVE, ATTACK, HEAL]; // bare minimum creep body definition
	var extras = [MOVE, ATTACK];
	var bonus = [HEAL];
	var extraBonus = [];

	return this.CreepFactory(body, mem, extras, bonus, extraBonus);
};

Creep.prototype.startGuard = function () {
	var creep = this;
	var mem = creep.memory;

	if (mem.room && mem.room !== creep.room.name) {
		creep.setGoing(new RoomPosition(25, 25, mem.room), 'startGuard', 20);
		return;
	}
	var target = creep.pos.findNearestSource(RESOURCE_ENERGY, creep.carryCapacity);

	if (target) {
		creep.memory.state = FILLING;
		creep.memory.target = target.id;
		creep.setGoing(target, 'fillGuard', 1, 'movingTargetGuard');
	} else {
		console.log(creep.memory.genesis + ' ' + creep.name + ' cannot find a ' + RESOURCE_ENERGY + ' source');
	}
};
RoomPosition.prototype.findNearestDamagedStructure = function () {
	var pos = this;

	var damagedStructureTests = [
		s => s.my && s.structureType !== STRUCTURE_RAMPART,
		s => s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_RAMPART,
		s => s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL,
		s => s.structureType === STRUCTURE_ROAD
	];

	var nearestDamagedStructure = pos.findNearestThing(function (room) {

		var damagedStructures = room.find(FIND_STRUCTURES, {filter : s => s.hits < s.hitsMax});
		var target = damagedStructureTests.reduce(function (target, filter) {
			if (target) {
				return target;
			}

			var damagedStructureTypes = damagedStructures.filter(filter);
			if (damagedStructureTypes.length) {
				//return pos.findClosestByRange(damagedStructureTypes);

				// hack to allow for ramparts to be made once and fixed immediately
				//var mostDamagedStructure = _.min(damagedStructureTypes, s => s.hits/s.hitsMax);
				var mostDamagedStructure = _.min(damagedStructureTypes, s => s.hits);

				if (mostDamagedStructure === Infinity) {
					return this.findClosestByRange(damagedStructureTypes);
				}

				return mostDamagedStructure;
			}
		}, undefined);

		return target;
	}, undefined);

	return nearestDamagedStructure;
};

Creep.prototype.movingTargetGuard = function () {
	var creep = this;

	var mem = creep.memory;

	var target = Game.getObjectById(mem.target);

	this.basicCreepRespawn(this.memory);
	var neededResource = creep.carryCapacity - _.sum(creep.carry);
	// make sure it's still a valid target
	if (target) {
		var predicate = s => true;
		if (mem.state === REPAIRING && (target instanceof Structure || target.hits < target.hitsMax )) {
			predicate = s => s === creep.carryCapacity;

		} else if (target instanceof StructureContainer || target instanceof StructureStorage) {
			predicate = s => s > target.store[RESOURCE_ENERGY];

		} else if (target instanceof Resource) {
			predicate = s => s > target.amount;

		} else if (target instanceof Source) {
			predicate = s => s > target.energy;

		} else {
			console.log(mem.genesis + ' ' + creep.name + ' is going to an unplanned target:' + target.id + ', ', JSON.stringify(target));
		}

		if (predicate(neededResource) || target.pos.fullySurrounded()) {
			target = undefined;
		}
	}

	// target is gone/invalid, get a new one
	if (!target) {

		// check if nearest energy dump
		if (creep.carry[mem.resource]) {
			target = creep.pos.findNearestDamagedStructure();
			if (target) {
				creep.memory.state = REPAIRING;
				mem.destination.then = 'runGuard';
			} else {
				creep.memory.state = UPGRADING;
				target = creep.pos.findNearestStructureTypes(STRUCTURE_CONTROLLER, true);
				mem.destination.then = 'upgraderGuard';
			}

			mem.destination.range = 3;

		} else {
			target = creep.pos.findNearestSource(mem.resource, neededResource);
			if (!target) {
				target = creep.pos.findNearestSource(mem.resource);
			}
			if (target) {
				creep.memory.state = FILLING;
				mem.destination.then = 'fillGuard';
				mem.destination.range = 1;
			}
		}
	}

	// if we still don't have a target, fuuuuck
	if (!target) {
		throw '' + mem.genesis + ' ' + creep.name + ' cannot find anywhere to go';
	}

	creep.memory.target = target.id;

	return target.pos;
};

Creep.prototype.fillGuard = function () {
	var creep = this;
	var source = Game.getObjectById(creep.memory.target);
	this.basicCreepRespawn(this.memory);
	// find a new one
	if (!source || _.sum(creep.carry) >= creep.carryCapacity) {
		delete creep.memory.target;
		creep.setRun('gotoThen');
		return;
	}

	var res = creep.takeResource(source, creep.memory.resource);
	if (res === ERR_NOT_ENOUGH_ENERGY) {
		delete creep.memory.target;
		creep.setRun('gotoThen');
	} else if (res !== OK) {
		console.log('error filling guard ' + creep.name + ':' + strerror(res));
	}
};

Creep.prototype.upgraderGuard = function () {
	var creep = this;
	var controller = Game.getObjectById(creep.memory.target);
	this.basicCreepRespawn(this.memory);
	// find a new one
	var totalCarry = _.sum(creep.carry);
	if (!controller || totalCarry <= 0) {
		creep.memory.range = totalCarry ? 3 : 1;
		delete creep.memory.target;
		creep.setRun('gotoThen');
		return;
	}

	var res = creep.upgradeController(controller);
	if (res === ERR_NOT_ENOUGH_ENERGY) {
		creep.memory.range = 1;
		delete creep.memory.target;
		creep.setRun('gotoThen');
	} else if (res !== OK) {
		console.log('error guard upgrading controller ' + creep.name + ':' + strerror(res));
	}
};

Creep.prototype.runGuard = function () {
	var creep = this;
	var res;
	var site = Game.getObjectById(creep.memory.target);
	this.basicCreepRespawn(this.memory);
	var totalCarry = _.sum(creep.carry);
	if (totalCarry <= 0 || !site || site.hits >= site.hitsMax) {
		creep.memory.range = totalCarry ? 3 : 1;
		delete creep.memory.target;
		creep.setRun('gotoThen');
		return;
	}

	res = creep.repair(site);
	if (res !== OK) {
		console.log('guard ' + creep.name + 'cannot repair site:' + site.id + ':' + strerror(res));
	}

};

module.exports = {};