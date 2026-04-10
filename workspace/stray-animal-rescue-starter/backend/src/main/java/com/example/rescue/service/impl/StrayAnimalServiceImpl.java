package com.example.rescue.service.impl;

import com.example.rescue.entity.StrayAnimal;
import com.example.rescue.mapper.StrayAnimalRepository;
import com.example.rescue.service.StrayAnimalService;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class StrayAnimalServiceImpl implements StrayAnimalService {

    private final StrayAnimalRepository strayAnimalRepository;

    public StrayAnimalServiceImpl(StrayAnimalRepository strayAnimalRepository) {
        this.strayAnimalRepository = strayAnimalRepository;
    }

    @Override
    public List<StrayAnimal> listAll() {
        return strayAnimalRepository.findAll();
    }

    @Override
    public StrayAnimal save(StrayAnimal strayAnimal) {
        return strayAnimalRepository.save(strayAnimal);
    }
}
